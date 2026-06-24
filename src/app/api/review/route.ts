import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const MAX_CODE_LENGTH = 50_000;

const VALID_LANGUAGES = new Set([
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C#",
  "C++",
  "Go",
  "Rust",
  "Other",
]);

function createGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Groq({ apiKey });
}

function sanitizeLanguage(lang: unknown): string {
  if (typeof lang !== "string" || !VALID_LANGUAGES.has(lang)) {
    return "Other";
  }
  return lang;
}

type ReviewResult = {
  languageMismatch: boolean;
  detectedLanguage: string;
  bugs: string[];
  quality: string[];
  security: string[];
  suggestions: string[];
  fixedCode: string | null;
};

function validateResult(raw: unknown): ReviewResult {
  const obj = raw as Record<string, unknown>;
  return {
    languageMismatch: typeof obj.languageMismatch === "boolean" ? obj.languageMismatch : false,
    detectedLanguage: typeof obj.detectedLanguage === "string" ? obj.detectedLanguage : "Unknown",
    bugs: Array.isArray(obj.bugs) ? obj.bugs.filter((s): s is string => typeof s === "string") : [],
    quality: Array.isArray(obj.quality) ? obj.quality.filter((s): s is string => typeof s === "string") : [],
    security: Array.isArray(obj.security) ? obj.security.filter((s): s is string => typeof s === "string") : [],
    suggestions: Array.isArray(obj.suggestions) ? obj.suggestions.filter((s): s is string => typeof s === "string") : [],
    fixedCode: typeof obj.fixedCode === "string" ? obj.fixedCode : null,
  };
}

export async function POST(req: NextRequest) {
  const groq = createGroqClient();
  if (!groq) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  let body: { code?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { code, language: rawLanguage } = body;

  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  if (code.length > MAX_CODE_LENGTH) {
    return NextResponse.json(
      { error: `Code exceeds maximum length of ${MAX_CODE_LENGTH.toLocaleString()} characters` },
      { status: 413 },
    );
  }

  const language = sanitizeLanguage(rawLanguage);

  try {
    const chat = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a senior software engineer doing a code review.
The user says the code is written in ${language}.

Step 1 — Language detection:
Analyze the code and determine what programming language it actually is.
If the detected language does NOT match "${language}", set "languageMismatch" to true,
"detectedLanguage" to the language you identified, and skip the rest of the review
(set bugs, quality, security, suggestions to empty arrays, and fixedCode to null).

Step 2 — If the language matches, review the code for bugs, quality, security, and suggestions.
Also produce a corrected version of the code that applies all your suggested fixes.

Respond ONLY with a JSON object in this exact format:
{
  "languageMismatch": false,
  "detectedLanguage": "${language}",
  "bugs": ["bug1", "bug2"],
  "quality": ["observation1", "observation2"],
  "security": ["issue1", "issue2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "fixedCode": "the corrected code as a single string, or null if no fixes needed"
}
No markdown, no explanation outside JSON.`,
        },
        { role: "user", content: code },
      ],
    });

    const choice = chat.choices?.[0];
    if (!choice?.message?.content) {
      return NextResponse.json({ error: "Empty response from AI" }, { status: 502 });
    }

    const parsed = JSON.parse(choice.message.content);
    const result = validateResult(parsed);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof SyntaxError) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
    }
    return NextResponse.json({ error: "Review service unavailable" }, { status: 502 });
  }
}
