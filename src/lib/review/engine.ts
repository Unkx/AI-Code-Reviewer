import type Groq from "groq-sdk";
import { randomUUID } from "node:crypto";
import type { ReviewFileInput } from "@/lib/github/types";
import type { CandidateFix, RawCandidateFix } from "@/lib/verify/types";

const SYSTEM_PROMPT = `You are a senior software engineer reviewing a GitHub pull request.
You will be given the full final content of each changed file, plus its diff.

For every concrete, high-confidence bug, security issue, or correctness problem you find,
propose a fix as a JSON object:
{
  "file": "path/as/given",
  "lineStart": 1,
  "lineEnd": 1,
  "replacement": "the exact lines of source that should replace lines lineStart..lineEnd (inclusive, 1-indexed) in the file's full content given to you",
  "explanation": "one sentence describing the bug and the fix"
}

Only propose a fix if you are confident it is behaviorally correct — this fix will be applied verbatim
and run against the project's real test suite before anyone sees it. Do not propose purely stylistic
or speculative changes.

Respond ONLY with a JSON array of these objects. Respond with an empty array if there is nothing to fix.
No markdown, no explanation outside the JSON array.`;

function buildUserContent(files: ReviewFileInput[]): string {
  return files
    .map((f) => `### File: ${f.file}\n\nFull content:\n${f.content}\n\nDiff:\n${f.patch}`)
    .join("\n\n---\n\n");
}

export function validateCandidateFixes(raw: unknown): RawCandidateFix[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const out: RawCandidateFix[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const { file, lineStart, lineEnd, replacement, explanation } = obj;

    if (typeof file !== "string" || !file) continue;
    if (typeof lineStart !== "number" || !Number.isInteger(lineStart) || lineStart < 1) continue;
    if (typeof lineEnd !== "number" || !Number.isInteger(lineEnd) || lineEnd < lineStart) continue;
    if (typeof replacement !== "string") continue;
    if (typeof explanation !== "string" || !explanation) continue;

    out.push({ file, lineStart, lineEnd, replacement, explanation });
  }
  return out;
}

export async function reviewPullRequest(groq: Groq, files: ReviewFileInput[]): Promise<CandidateFix[]> {
  if (files.length === 0) {
    return [];
  }

  const chat = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserContent(files) },
    ],
  });

  const content = chat.choices?.[0]?.message?.content;
  if (!content) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  return validateCandidateFixes(parsed).map((fix) => ({ ...fix, id: randomUUID() }));
}
