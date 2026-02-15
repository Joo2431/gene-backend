import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

/* =========================================================
   BASIC SETUP
========================================================= */

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

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY missing");
  process.exit(1);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   GEN-E SYSTEM PROMPT
========================================================= */

const SYSTEM_PROMPT = `
You are GEN-E, a structured AI Career Assistant.

You ONLY answer career and education related queries.

If user asks about politics, religion, health, crypto,
relationships or unrelated topics, respond:

"I am designed only for career and education guidance."

Response Style:
- Structured markdown
- Clear headings
- Bullet points
- No long essays
- Practical and realistic
- End with next action step
`;

/* =========================================================
   GUARDRAIL
========================================================= */

function guardrail(message) {
  const banned = [
    "politics",
    "religion",
    "crypto",
    "relationship",
    "dating",
    "medical",
    "health advice",
    "trading",
    "betting"
  ];

  const lower = message.toLowerCase();

  if (banned.some(word => lower.includes(word))) {
    return "I am designed only for career and education guidance.";
  }

  return null;
}

/* =========================================================
   INTENT DETECTION
========================================================= */

function detectIntent(message) {
  const msg = message.toLowerCase();

  if (msg.includes("resume")) return "resume";
  if (msg.includes("interview")) return "interview";
  if (msg.includes("score") || msg.includes("readiness")) return "score";

  return "career";
}

/* =========================================================
   PDF GENERATOR
========================================================= */

function generateResumePDF(content) {
  const fileName = `resume-${Date.now()}.pdf`;
  const filePath = path.join(__dirname, fileName);

  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(12).text(content, {
    width: 450,
    align: "left"
  });

  doc.end();

  return fileName;
}

/* =========================================================
   MAIN CHAT ENDPOINT
========================================================= */

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Invalid message" });
  }

  // Guardrail
  const blocked = guardrail(message);
  if (blocked) {
    return res.json({ reply: blocked });
  }

  const intent = detectIntent(message);

  let userPrompt = message;

  /* -------------------- RESUME MODE -------------------- */
  if (intent === "resume") {
    userPrompt = `
Create an ATS-friendly resume using this input:

${message}

Format strictly:

## Professional Summary
## Core Skills
## Experience
## Projects
## Education
`;
  }

  /* -------------------- INTERVIEW MODE -------------------- */
  if (intent === "interview") {
    userPrompt = `
Prepare interview guidance for:

${message}

Include:

## Quick Analysis
## HR Questions
## Technical Questions
## STAR Answer Strategy
## Practical Next Step
`;
  }

  /* -------------------- SCORE MODE -------------------- */
  if (intent === "score") {
    userPrompt = `
Evaluate career readiness based on:

${message}

Return:

Career Readiness Score: XX%

## Strengths
## Skill Gaps
## Action Plan
`;
  }

  /* -------------------- CAREER MODE -------------------- */
  if (intent === "career") {
    userPrompt = `
Provide structured career guidance for:

${message}

Include:

## Quick Analysis
## Recommended Roles
## Skill Gaps
## Action Plan
## Practical Next Step
`;
  }

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    });

    const output =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text;

    // Resume PDF handling
    if (intent === "resume") {
      const fileName = generateResumePDF(output);

      return res.json({
        reply: output,
        pdf: `/download/${fileName}`
      });
    }

    res.json({ reply: output });

  } catch (err) {
    console.error("❌ OpenAI Error:", err);
    res.status(500).json({
      error: err.message || "AI error"
    });
  }
});

/* =========================================================
   DOWNLOAD ENDPOINT
========================================================= */

app.get("/download/:file", (req, res) => {
  const filePath = path.join(__dirname, req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(filePath);
});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Gen-E V1",
    timestamp: new Date().toISOString()
  });
});

/* =========================================================
   START SERVER
========================================================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Gen-E V1 backend running on port ${PORT}`);
});
