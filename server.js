import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import multer from "multer";
import unzipper from "unzipper";
import mammoth from "mammoth";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

/* =========================================================
   BASIC SETUP
========================================================= */

app.use(
  cors({
    origin: "*"
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
   UPLOAD DIRECTORY
========================================================= */

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

/* =========================================================
   SYSTEM PROMPT
========================================================= */

const SYSTEM_PROMPT = `
You are GEN-E, a structured AI Career Assistant.

You ONLY answer career and education related queries.

If user asks about politics, religion, crypto,
relationships, medical advice or unrelated topics, respond:

"I am designed only for career and education guidance."

Response Style:
- Structured markdown
- Clear headings
- Bullet points
- Concise and practical
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
    "health",
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
   FILE TEXT EXTRACTION (Stable Version)
========================================================= */

async function extractTextFromFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  // ---------- PDF ----------
  if (ext === ".pdf") {
    try {
      const data = fs.readFileSync(file.path);
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(data);
      return parsed.text;
    } catch (err) {
      console.error("PDF parsing failed:", err);
      return "Could not extract text from PDF.";
    }
  }

  // ---------- DOCX ----------
  if (ext === ".docx") {
    try {
      const result = await mammoth.extractRawText({
        path: file.path
      });
      return result.value;
    } catch {
      return "Could not extract text from DOCX.";
    }
  }

  // ---------- TXT ----------
  if (ext === ".txt") {
    return fs.readFileSync(file.path, "utf8");
  }

  // ---------- ZIP ----------
  if (ext === ".zip") {
    let combined = "";
    const directory = await unzipper.Open.file(file.path);

    for (const entry of directory.files) {
      if (!entry.path.endsWith("/")) {
        const content = await entry.buffer();
        combined += content.toString() + "\n\n";
      }
    }

    return combined;
  }

  return "Unsupported file format.";
}

/* =========================================================
   CHAT ENDPOINT
========================================================= */

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Invalid message" });
  }

  const blocked = guardrail(message);
  if (blocked) {
    return res.json({ reply: blocked });
  }

  const intent = detectIntent(message);
  let userPrompt = message;

  if (intent === "resume") {
    userPrompt = `
Create an ATS-friendly resume using:

${message}

Format:

## Professional Summary
## Core Skills
## Experience
## Projects
## Education
`;
  }

  if (intent === "interview") {
    userPrompt = `
Prepare interview guidance for:

${message}

Include:

## Quick Analysis
## HR Questions
## Technical Questions
## STAR Strategy
## Practical Next Step
`;
  }

  if (intent === "score") {
    userPrompt = `
Evaluate career readiness:

${message}

Return:

Career Readiness Score: XX%

## Strengths
## Skill Gaps
## Action Plan
`;
  }

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

    const output = response.output_text;

    if (intent === "resume") {
      const fileName = generateResumePDF(output);
      return res.json({
        reply: output,
        pdf: `/download/${fileName}`
      });
    }

    res.json({ reply: output });

  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "AI processing failed" });
  }
});

/* =========================================================
   FILE UPLOAD ENDPOINT
========================================================= */

app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const extractedText = await extractTextFromFile(req.file);

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `
The user uploaded a career document.

Analyze it and provide:

## Document Summary
## Strengths
## Weaknesses
## Career Readiness Score (0-100%)
## Improvement Suggestions
## Clarifying Questions

Document content:
${extractedText}
`
        }
      ]
    });

    const output = response.output_text;

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ reply: output });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "File processing failed" });
  }
});

/* =========================================================
   DOWNLOAD
========================================================= */

app.get("/download/:file", (req, res) => {
  const filePath = path.join(__dirname, req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(filePath);
});

/* =========================================================
   HEALTH
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
