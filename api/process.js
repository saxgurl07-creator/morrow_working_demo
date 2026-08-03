module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      message: "Morrow AI endpoint is deployed.",
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is missing in Vercel project settings."
    });
  }

  const { imageData } = req.body || {};
  if (!imageData || !imageData.startsWith("data:image/")) {
    return res.status(400).json({ error: "Please send a valid image." });
  }

  if (imageData.length > 6_000_000) {
    return res.status(413).json({
      error: "Image is too large. Please use an image under 4 MB."
    });
  }

  const prompt = `You are the extraction engine for Morrow, a family memory assistant.

Read this teacher preference or favorites image and return ONLY valid JSON using this exact shape:

{
  "teacher_name": "",
  "teacher_birthday": "",
  "child_or_class": "",
  "school": "",
  "favorite_drinks": [],
  "favorite_snacks": [],
  "favorite_stores": [],
  "other_likes": [],
  "dislikes_or_allergies": []
}

Rules:
- Extract only facts that are visibly supported by the image.
- Never guess a teacher name, birthday, school, preference, brand, allergy, or relationship.
- For teacher_birthday, preserve the visible month and day, such as "October 18".
- Include the year only if the image explicitly gives one.
- Use an empty string when the birthday is missing or unreadable.
- Use empty strings or arrays when other information is absent.
- Keep list items short and useful.
- Put restaurants, shops, and gift-card brands in favorite_stores.
- Put hobbies, colors, flowers, sports teams, scents, and interests in other_likes.
- Return JSON only. Do not use markdown fences.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageData, detail: "high" }
          ]
        }],
        max_output_tokens: 900
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", payload);
      return res.status(response.status).json({
        error: payload?.error?.message || "The AI request failed."
      });
    }

    const text =
      payload.output_text ||
      payload.output?.flatMap(item => item.content || [])
        .find(part => part.type === "output_text")?.text;

    if (!text) {
      return res.status(502).json({
        error: "The AI returned no readable result."
      });
    }

    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const result = JSON.parse(cleaned);

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Could not process the image. Check the Vercel function logs."
    });
  }
};
