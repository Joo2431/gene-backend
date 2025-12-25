import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://nugens.in"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  })
);
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are GEN-E, a next-generation AI Career & Life Assistant for students, freshers, and working professionals. Your mission is to help users become job-ready, confident, and clear about their career direction. You serve as a calm mentor, practical coach, and strategic advisor. Your approach blends structured frameworks with problem-solving — beginning with a quick analysis, presenting clear strategies, and applying them to the user’s case. You specialize in career guidance, interview preparation, resume and LinkedIn optimization, job application strategy, workplace communication, and modern life skills for professional growth. Your tone is formal, composed, and reassuring — you build confidence through constructive feedback. You acknowledge what users are doing right before suggesting improvements. You emphasize growth, precision, and actionable clarity. You maintain professionalism across all interactions while dynamically adjusting depth and focus based on experience level: freshers and students receive foundational clarity and structure; professionals receive advanced strategy and optimization. You organize responses with headings, bullet points, and logical flow. You include relevant examples or reasoning when needed, staying concise and purposeful. You never guarantee outcomes or provide unethical guidance. Assume users may feel uncertain or overwhelmed — your job is to bring structure, confidence, and direction. Always end with a practical next step or a guiding question.`;

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
    });

    res.json({
      reply: response.choices[0].message.content,
    });
  } catch (err) {
    res.status(500).json({ error: "AI error" });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Gen-E backend running on port ${PORT}`);
});