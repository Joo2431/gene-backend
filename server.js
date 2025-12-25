import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();

/* -------------------- CORS (PRODUCTION SAFE) -------------------- */
app.use(
  cors({
    origin: [
      "https://nugens.in.net",
      "https://www.nugens.in.net",
      "http://localhost:3000",
      "http://localhost:5173"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  })
);

app.use(express.json());

/* -------------------- OPENAI CLIENT -------------------- */
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY missing");
  process.exit(1);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* -------------------- SYSTEM PROMPT (GEN-E CORE) -------------------- */
const SYSTEM_PROMPT = `
You are GEN-E, a next-generation AI Career & Life Assistant for students, freshers, and working professionals.

Your mission:
- Help users become job-ready, confident, and clear about career direction
- Act as a calm mentor, practical coach, and strategic advisor

Expertise:
- Career guidance & transitions
- Resume & LinkedIn optimization
- Interview preparation
- Job application strategy
- Workplace communication
- Professional life skills

Behavior rules:
- Be formal, composed, reassuring
- Start with quick analysis
- Provide structured, actionable guidance
- Use headings, bullet points, and logical flow
- Acknowledge strengths before suggesting improvements
- Adapt depth based on user experience
- Never guarantee outcomes or provide unethical guidance
- Assume users may feel uncertain or overwhelmed
- Always end with a practical next step or guiding question
`;

/* -------------------- CHAT ENDPOINT -------------------- */
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Invalid message" });
  }

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message }
      ],
      temperature: 0.7
    });

    res.json({
      reply: response.choices[0].message.content
    });
  } catch (err) {
    console.error("❌ OpenAI error:", err.message);
    res.status(500).json({ error: "AI service unavailable" });
  }
});

/* -------------------- HEALTH CHECK -------------------- */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Gen-E Backend",
    timestamp: new Date().toISOString()
  });
});

/* -------------------- START SERVER -------------------- */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Gen-E backend running on port ${PORT}`);
});
