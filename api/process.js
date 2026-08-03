module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      message: 'Morrow AI endpoint is deployed.',
      hasApiKey: Boolean(process.env.OPENAI_API_KEY)
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is missing in Vercel.' });
  }

  const { imageData } = req.body || {};
  if (!imageData || !imageData.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Please send a valid image.' });
  }

  if (imageData.length > 4_000_000) {
    return res.status(413).json({ error: 'The compressed image is still too large.' });
  }

  const prompt = `Read this teacher favorites or preference sheet. Return ONLY valid JSON in this exact shape:
{
  "teacher_name": "",
  "child_or_class": "",
  "school": "",
  "favorite_drinks": [],
  "favorite_snacks": [],
  "favorite_stores": [],
  "other_likes": [],
  "dislikes_or_allergies": [],
  "suggested_reminder": ""
}
Rules: extract only facts visible in the image; never guess; use empty strings or arrays when absent; keep list items short; if no reminder date is visible, suggest bringing it back one week before Teacher Appreciation Week; return JSON only.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: imageData, detail: 'high' }
          ]
        }],
        max_output_tokens: 900
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      console.error('OpenAI error', payload);
      return res.status(response.status).json({ error: payload?.error?.message || 'AI request failed.' });
    }

    const text = payload.output_text || payload.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
    if (!text) return res.status(502).json({ error: 'The AI returned no readable result.' });

    const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return res.status(200).json(JSON.parse(cleaned));
  } catch (error) {
    console.error('Morrow processing error', error);
    return res.status(500).json({ error: 'Could not process the image. Check the Vercel runtime logs.' });
  }
};
