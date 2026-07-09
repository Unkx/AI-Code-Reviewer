# Verified PR Review Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn CodeLens from a snippet-paste review tool into a GitHub App that reviews pull requests and only posts fix suggestions once they've been proven to pass the repo's real test suite.

**Architecture:** A GitHub App webhook lands on a single Next.js API route. On PR open/sync, an AI review engine (Groq/Llama, reused from the current snippet tool) proposes candidate fixes. Each candidate is committed to a disposable branch and a GitHub Actions workflow (auto-installed into the target repo on app install) is dispatched to run `npm test` against it. A `workflow_run` webhook reports the result; passing fixes are posted as inline GitHub suggestion-block comments, failing ones are dropped without a trace. Pending verifications live in Upstash Redis with a TTL, since the dispatch → result round trip is asynchronous.

**Tech Stack:** Next.js 16 (App Router) API routes, TypeScript, `@octokit/rest` + `@octokit/auth-app` for GitHub, `@upstash/redis` for pending-verification state, `groq-sdk` (existing), Vitest (existing).

## Global Constraints

- v1 scope is JavaScript/TypeScript repositories only. Test command is detected exclusively via `package.json`'s `scripts.test`.
- The webhook receiver is a Next.js API route hosted on Vercel — no separate server.
- Test execution happens only on GitHub-hosted Actions runners, inside a workflow file (`.github/workflows/codelens-verify.yml`) that the app installs into the target repo via a one-time setup PR on install.
- Candidate fixes that fail their test run, or that can't be verified because a run never completes, are dropped silently — no comment, no trace.
- The one exception: if a repo has no detectable `npm test` script at all, verification is skipped for the whole PR and findings are posted as a single plain-text informational comment, explicitly labeled unverified.
- Verified fixes are posted as inline GitHub suggestion-block PR review comments (one-click apply), not summary diffs.
- Pending-verification records live in Upstash Redis (Vercel Marketplace) with a TTL — no relational database.
- A Vercel Cron job sweeps stale pending verifications (and their orphaned temp branches) every 20 minutes, so a `workflow_run` that never fires doesn't leak a branch forever.
- The existing snippet-paste UI and its `/api/review` route are retired, not kept alongside the bot.
- No live-GitHub end-to-end test runs in CI; a manual verification checklist covers that instead (see Task 13).

---

### Task 1: Project setup — dependencies, env vars, shared types

**Files:**
- Modify: `package.json` (add dependencies)
- Modify: `.env.local` (document new vars locally — values are secrets the user fills in, not committed)
- Modify: `README.md` (env var table)
- Create: `src/lib/verify/types.ts`
- Create: `src/lib/github/types.ts`

**Interfaces:**
- Produces: `RawCandidateFix`, `CandidateFix`, `PendingVerification` (from `src/lib/verify/types.ts`); `ReviewFileInput` (from `src/lib/github/types.ts`) — every later task imports these.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install @octokit/rest @octokit/auth-app @upstash/redis
```
Expected: `package.json` gains `@octokit/rest`, `@octokit/auth-app`, `@upstash/redis` under `dependencies`.

- [ ] **Step 2: Write shared verify types**

Create `src/lib/verify/types.ts`:
```typescript
export type RawCandidateFix = {
  file: string;
  lineStart: number;
  lineEnd: number;
  replacement: string;
  explanation: string;
};

export type CandidateFix = RawCandidateFix & {
  id: string;
};

export type PendingVerification = {
  branch: string;
  owner: string;
  repo: string;
  installationId: number;
  prNumber: number;
  file: string;
  lineStart: number;
  lineEnd: number;
  replacement: string;
  explanation: string;
  headShaAtDispatch: string;
  createdAt: number;
};
```

- [ ] **Step 3: Write shared GitHub types**

Create `src/lib/github/types.ts`:
```typescript
export type ReviewFileInput = {
  file: string;
  content: string;
  patch: string;
};
```

- [ ] **Step 4: Document new environment variables**

Append to `.env.local` (values left blank for the user to fill in):
```
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_GITHUB_APP_SLUG=
CRON_SECRET=
```

Add a row to the `## Environment Variables` table in `README.md` for each:

| Variable | Required | Description |
|----------|----------|--------------|
| `GITHUB_APP_ID` | Yes | App ID from the GitHub App settings page |
| `GITHUB_APP_PRIVATE_KEY` | Yes | PEM private key from the GitHub App settings page (`\n`-escaped if stored as one line) |
| `GITHUB_WEBHOOK_SECRET` | Yes | Webhook secret configured on the GitHub App |
| `UPSTASH_REDIS_REST_URL` | Yes | From the Upstash Redis database (Vercel Marketplace) |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | From the Upstash Redis database (Vercel Marketplace) |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | Yes | The app's slug, used to build the install link |
| `CRON_SECRET` | Yes | Random secret; authorizes the stale-verification cleanup cron (Task 14) |
| `GROQ_API_KEY` | Yes | API key from console.groq.com |

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.local README.md src/lib/verify/types.ts src/lib/github/types.ts
git commit -m "chore: add PR bot dependencies and shared types"
```

---

### Task 2: Webhook signature verification

**Files:**
- Create: `src/lib/github/verify-signature.ts`
- Test: `src/lib/github/__tests__/verify-signature.test.ts`

**Interfaces:**
- Produces: `verifyGithubSignature(payload: string, signatureHeader: string | null, secret: string): boolean` — consumed by the webhook route (Task 12).

- [ ] **Step 1: Write the failing test**

Create `src/lib/github/__tests__/verify-signature.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyGithubSignature } from "../verify-signature";

const SECRET = "test-secret";

function sign(payload: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

describe("verifyGithubSignature", () => {
  it("accepts a correctly signed payload", () => {
    const payload = JSON.stringify({ hello: "world" });
    expect(verifyGithubSignature(payload, sign(payload, SECRET), SECRET)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    const payload = JSON.stringify({ hello: "world" });
    expect(verifyGithubSignature(payload, sign(payload, "wrong-secret"), SECRET)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const payload = JSON.stringify({ hello: "world" });
    const signature = sign(payload, SECRET);
    expect(verifyGithubSignature(JSON.stringify({ hello: "mallory" }), signature, SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyGithubSignature("{}", null, SECRET)).toBe(false);
  });

  it("rejects a signature header missing the sha256= prefix", () => {
    const payload = "{}";
    const raw = createHmac("sha256", SECRET).update(payload).digest("hex");
    expect(verifyGithubSignature(payload, raw, SECRET)).toBe(false);
  });

  it("rejects a signature of the wrong length", () => {
    expect(verifyGithubSignature("{}", "sha256=abc", SECRET)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/__tests__/verify-signature.test.ts`
Expected: FAIL — `Cannot find module '../verify-signature'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/github/verify-signature.ts`:
```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyGithubSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expectedHex = createHmac("sha256", secret).update(payload).digest("hex");
  const expected = Buffer.from(expectedHex, "utf-8");
  const actual = Buffer.from(signatureHeader.slice("sha256=".length), "utf-8");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/__tests__/verify-signature.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/verify-signature.ts src/lib/github/__tests__/verify-signature.test.ts
git commit -m "feat: add GitHub webhook signature verification"
```

---

### Task 3: GitHub App installation client

**Files:**
- Create: `src/lib/github/app-client.ts`
- Test: `src/lib/github/__tests__/app-client.test.ts`

**Interfaces:**
- Consumes: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` env vars (Task 1).
- Produces: `createInstallationOctokit(installationId: number): Octokit` — consumed by the webhook route (Task 12).

- [ ] **Step 1: Write the failing test**

Create `src/lib/github/__tests__/app-client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const OctokitCtor = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: OctokitCtor,
}));
vi.mock("@octokit/auth-app", () => ({
  createAppAuth: "createAppAuth-marker",
}));

describe("createInstallationOctokit", () => {
  beforeEach(() => {
    vi.resetModules();
    OctokitCtor.mockReset();
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN KEY-----\\nabc\\n-----END KEY-----";
  });

  afterEach(() => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
  });

  it("builds an Octokit client authenticated as the installation", async () => {
    const { createInstallationOctokit } = await import("../app-client");
    createInstallationOctokit(999);

    expect(OctokitCtor).toHaveBeenCalledWith({
      authStrategy: "createAppAuth-marker",
      auth: {
        appId: "12345",
        privateKey: "-----BEGIN KEY-----\nabc\n-----END KEY-----",
        installationId: 999,
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/__tests__/app-client.test.ts`
Expected: FAIL — `Cannot find module '../app-client'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/github/app-client.ts`:
```typescript
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";

export function createInstallationOctokit(installationId: number): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID,
      privateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      installationId,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/__tests__/app-client.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/app-client.ts src/lib/github/__tests__/app-client.test.ts
git commit -m "feat: add GitHub App installation-scoped Octokit client"
```

---

### Task 4: Test-command detection

**Files:**
- Create: `src/lib/verify/detect-test-command.ts`
- Test: `src/lib/verify/__tests__/detect-test-command.test.ts`

**Interfaces:**
- Produces: `detectTestCommand(packageJsonContent: string): string | null` — consumed by the webhook route (Task 12).

- [ ] **Step 1: Write the failing test**

Create `src/lib/verify/__tests__/detect-test-command.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { detectTestCommand } from "../detect-test-command";

describe("detectTestCommand", () => {
  it("returns npm test when a real test script is defined", () => {
    const pkg = JSON.stringify({ scripts: { test: "vitest run" } });
    expect(detectTestCommand(pkg)).toBe("npm test");
  });

  it("returns null for the npm-init placeholder test script", () => {
    const pkg = JSON.stringify({
      scripts: { test: 'echo "Error: no test specified" && exit 1' },
    });
    expect(detectTestCommand(pkg)).toBeNull();
  });

  it("returns null when scripts.test is missing", () => {
    expect(detectTestCommand(JSON.stringify({ scripts: { build: "tsc" } }))).toBeNull();
  });

  it("returns null when scripts is missing", () => {
    expect(detectTestCommand(JSON.stringify({ name: "pkg" }))).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(detectTestCommand("{ not json")).toBeNull();
  });

  it("returns null for an empty test script", () => {
    expect(detectTestCommand(JSON.stringify({ scripts: { test: "   " } }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/verify/__tests__/detect-test-command.test.ts`
Expected: FAIL — `Cannot find module '../detect-test-command'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/verify/detect-test-command.ts`:
```typescript
export function detectTestCommand(packageJsonContent: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(packageJsonContent);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const scripts = (parsed as Record<string, unknown>).scripts;
  if (!scripts || typeof scripts !== "object") {
    return null;
  }

  const testScript = (scripts as Record<string, unknown>).test;
  if (typeof testScript !== "string" || !testScript.trim()) {
    return null;
  }

  if (testScript.includes("Error: no test specified")) {
    return null;
  }

  return "npm test";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/verify/__tests__/detect-test-command.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/verify/detect-test-command.ts src/lib/verify/__tests__/detect-test-command.test.ts
git commit -m "feat: detect npm test command from package.json"
```

---

### Task 5: Review engine — PR diff to candidate fixes

**Files:**
- Create: `src/lib/review/engine.ts`
- Test: `src/lib/review/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: `ReviewFileInput` (Task 1), `RawCandidateFix`/`CandidateFix` (Task 1).
- Produces: `validateCandidateFixes(raw: unknown): RawCandidateFix[]`, `reviewPullRequest(groq: Groq, files: ReviewFileInput[]): Promise<CandidateFix[]>` — consumed by the webhook route (Task 12).

- [ ] **Step 1: Write the failing test**

Create `src/lib/review/__tests__/engine.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import type Groq from "groq-sdk";
import { validateCandidateFixes, reviewPullRequest } from "../engine";

describe("validateCandidateFixes", () => {
  it("passes through a fully valid array", () => {
    const raw = [
      { file: "a.ts", lineStart: 1, lineEnd: 2, replacement: "const x = 1;", explanation: "fix" },
    ];
    expect(validateCandidateFixes(raw)).toEqual(raw);
  });

  it("returns empty array for non-array input", () => {
    expect(validateCandidateFixes({})).toEqual([]);
    expect(validateCandidateFixes(null)).toEqual([]);
  });

  it("drops entries missing a file", () => {
    expect(validateCandidateFixes([{ lineStart: 1, lineEnd: 1, replacement: "x", explanation: "e" }])).toEqual([]);
  });

  it("drops entries with lineEnd before lineStart", () => {
    const raw = [{ file: "a.ts", lineStart: 5, lineEnd: 2, replacement: "x", explanation: "e" }];
    expect(validateCandidateFixes(raw)).toEqual([]);
  });

  it("drops entries with non-integer line numbers", () => {
    const raw = [{ file: "a.ts", lineStart: 1.5, lineEnd: 2, replacement: "x", explanation: "e" }];
    expect(validateCandidateFixes(raw)).toEqual([]);
  });

  it("drops entries with an empty explanation", () => {
    const raw = [{ file: "a.ts", lineStart: 1, lineEnd: 1, replacement: "x", explanation: "" }];
    expect(validateCandidateFixes(raw)).toEqual([]);
  });

  it("keeps valid entries and drops invalid ones from the same array", () => {
    const raw = [
      { file: "a.ts", lineStart: 1, lineEnd: 1, replacement: "x", explanation: "ok" },
      { file: "b.ts", lineStart: 0, lineEnd: 1, replacement: "y", explanation: "bad start" },
    ];
    expect(validateCandidateFixes(raw)).toEqual([raw[0]]);
  });
});

describe("reviewPullRequest", () => {
  function fakeGroq(content: string | null) {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({ choices: [{ message: { content } }] }),
        },
      },
    } as unknown as Groq;
  }

  it("returns [] when there are no files", async () => {
    const groq = fakeGroq(null);
    expect(await reviewPullRequest(groq, [])).toEqual([]);
  });

  it("returns [] when Groq responds with empty content", async () => {
    const groq = fakeGroq(null);
    expect(await reviewPullRequest(groq, [{ file: "a.ts", content: "x", patch: "" }])).toEqual([]);
  });

  it("returns [] when Groq responds with invalid JSON", async () => {
    const groq = fakeGroq("not json");
    expect(await reviewPullRequest(groq, [{ file: "a.ts", content: "x", patch: "" }])).toEqual([]);
  });

  it("returns validated candidate fixes with generated ids", async () => {
    const raw = [{ file: "a.ts", lineStart: 1, lineEnd: 1, replacement: "const x = 1;", explanation: "fix" }];
    const groq = fakeGroq(JSON.stringify(raw));
    const result = await reviewPullRequest(groq, [{ file: "a.ts", content: "const x = 2;", patch: "@@" }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(raw[0]);
    expect(typeof result[0].id).toBe("string");
    expect(result[0].id.length).toBeGreaterThan(0);
  });

  it("sends file content and diff to Groq", async () => {
    const groq = fakeGroq("[]");
    await reviewPullRequest(groq, [{ file: "a.ts", content: "FILE_CONTENT", patch: "DIFF_PATCH" }]);
    const call = (groq.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.messages[1].content).toContain("FILE_CONTENT");
    expect(call.messages[1].content).toContain("DIFF_PATCH");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/review/__tests__/engine.test.ts`
Expected: FAIL — `Cannot find module '../engine'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/review/engine.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/review/__tests__/engine.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/engine.ts src/lib/review/__tests__/engine.test.ts
git commit -m "feat: add PR review engine producing candidate fixes"
```

---

### Task 6: Redis pending-verification store

**Files:**
- Create: `src/lib/verify/pending-store.ts`
- Test: `src/lib/verify/__tests__/pending-store.test.ts`

**Interfaces:**
- Consumes: `PendingVerification` (Task 1).
- Produces: `savePendingVerification(v: PendingVerification): Promise<void>`, `getPendingVerification(branch: string): Promise<PendingVerification | null>`, `deletePendingVerification(branch: string): Promise<void>`, `listPendingVerifications(): Promise<PendingVerification[]>` — consumed by the orchestrator (Task 9), result handler (Task 11), and the stale-verification sweep (Task 14).

- [ ] **Step 1: Write the failing test**

Create `src/lib/verify/__tests__/pending-store.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PendingVerification } from "../types";

const redisMock = { set: vi.fn(), get: vi.fn(), del: vi.fn(), keys: vi.fn(), mget: vi.fn() };

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => redisMock },
}));

describe("pending-store", () => {
  beforeEach(() => {
    vi.resetModules();
    redisMock.set.mockReset();
    redisMock.get.mockReset();
    redisMock.del.mockReset();
    redisMock.keys.mockReset();
    redisMock.mget.mockReset();
  });

  const record: PendingVerification = {
    branch: "codelens/verify/1/0",
    owner: "acme",
    repo: "widgets",
    installationId: 42,
    prNumber: 1,
    file: "src/a.ts",
    lineStart: 1,
    lineEnd: 1,
    replacement: "const x = 1;",
    explanation: "fix",
    headShaAtDispatch: "abc123",
    createdAt: 1_000,
  };

  it("saves a record with a namespaced key and a TTL", async () => {
    const { savePendingVerification } = await import("../pending-store");
    await savePendingVerification(record);
    expect(redisMock.set).toHaveBeenCalledWith(`verify:${record.branch}`, record, { ex: 1800 });
  });

  it("reads a record back by branch", async () => {
    redisMock.get.mockResolvedValue(record);
    const { getPendingVerification } = await import("../pending-store");
    expect(await getPendingVerification(record.branch)).toEqual(record);
    expect(redisMock.get).toHaveBeenCalledWith(`verify:${record.branch}`);
  });

  it("returns null when no record exists", async () => {
    redisMock.get.mockResolvedValue(null);
    const { getPendingVerification } = await import("../pending-store");
    expect(await getPendingVerification("missing")).toBeNull();
  });

  it("deletes a record by branch", async () => {
    const { deletePendingVerification } = await import("../pending-store");
    await deletePendingVerification(record.branch);
    expect(redisMock.del).toHaveBeenCalledWith(`verify:${record.branch}`);
  });

  it("lists all pending records", async () => {
    redisMock.keys.mockResolvedValue([`verify:${record.branch}`]);
    redisMock.mget.mockResolvedValue([record]);
    const { listPendingVerifications } = await import("../pending-store");
    expect(await listPendingVerifications()).toEqual([record]);
    expect(redisMock.keys).toHaveBeenCalledWith("verify:*");
    expect(redisMock.mget).toHaveBeenCalledWith(`verify:${record.branch}`);
  });

  it("returns an empty array when nothing is pending", async () => {
    redisMock.keys.mockResolvedValue([]);
    const { listPendingVerifications } = await import("../pending-store");
    expect(await listPendingVerifications()).toEqual([]);
    expect(redisMock.mget).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/verify/__tests__/pending-store.test.ts`
Expected: FAIL — `Cannot find module '../pending-store'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/verify/pending-store.ts`:
```typescript
import { Redis } from "@upstash/redis";
import type { PendingVerification } from "./types";

const redis = Redis.fromEnv();
const TTL_SECONDS = 30 * 60;

function key(branch: string): string {
  return `verify:${branch}`;
}

export async function savePendingVerification(v: PendingVerification): Promise<void> {
  await redis.set(key(v.branch), v, { ex: TTL_SECONDS });
}

export async function getPendingVerification(branch: string): Promise<PendingVerification | null> {
  const value = await redis.get<PendingVerification>(key(branch));
  return value ?? null;
}

export async function deletePendingVerification(branch: string): Promise<void> {
  await redis.del(key(branch));
}

export async function listPendingVerifications(): Promise<PendingVerification[]> {
  const keys = await redis.keys("verify:*");
  if (keys.length === 0) {
    return [];
  }
  const values = await redis.mget<PendingVerification[]>(...keys);
  return values.filter((v): v is PendingVerification => v !== null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/verify/__tests__/pending-store.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/verify/pending-store.ts src/lib/verify/__tests__/pending-store.test.ts
git commit -m "feat: add Redis-backed pending-verification store"
```

---

### Task 7: Apply a candidate fix to a verify branch

**Files:**
- Create: `src/lib/verify/apply-patch.ts`
- Test: `src/lib/verify/__tests__/apply-patch.test.ts`

**Interfaces:**
- Consumes: `CandidateFix` (Task 1).
- Produces: `applyCandidateFixToBranch(octokit, params: { owner: string; repo: string; baseSha: string; branchName: string; fix: CandidateFix }): Promise<{ branch: string; commitSha: string }>` — consumed by the orchestrator (Task 9).

Implementation note: this uses the Contents API (`repos.createOrUpdateFileContents`) rather than the raw Git Data API blob/tree/commit dance — a single-file line replacement doesn't need it, and Contents API produces an identical externally-observable commit.

- [ ] **Step 1: Write the failing test**

Create `src/lib/verify/__tests__/apply-patch.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { applyCandidateFixToBranch } from "../apply-patch";
import type { CandidateFix } from "../types";

function fakeOctokit(fileContentLines: string[]) {
  const original = fileContentLines.join("\n");
  return {
    rest: {
      git: {
        createRef: vi.fn().mockResolvedValue({}),
      },
      repos: {
        getContent: vi.fn().mockResolvedValue({
          data: {
            type: "file",
            sha: "blob-sha-1",
            content: Buffer.from(original, "utf-8").toString("base64"),
          },
        }),
        createOrUpdateFileContents: vi.fn().mockResolvedValue({
          data: { commit: { sha: "commit-sha-1" } },
        }),
      },
    },
  };
}

const fix: CandidateFix = {
  id: "fix-1",
  file: "src/a.ts",
  lineStart: 2,
  lineEnd: 2,
  replacement: "const x = 2;\nconst y = 3;",
  explanation: "fix off-by-one",
};

describe("applyCandidateFixToBranch", () => {
  it("creates a branch off the base sha", async () => {
    const octokit = fakeOctokit(["line1", "line2", "line3"]);
    await applyCandidateFixToBranch(octokit as never, {
      owner: "acme",
      repo: "widgets",
      baseSha: "base-sha",
      branchName: "codelens/verify/1/0",
      fix,
    });
    expect(octokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      ref: "refs/heads/codelens/verify/1/0",
      sha: "base-sha",
    });
  });

  it("replaces the given line range with the replacement text", async () => {
    const octokit = fakeOctokit(["line1", "line2", "line3"]);
    await applyCandidateFixToBranch(octokit as never, {
      owner: "acme",
      repo: "widgets",
      baseSha: "base-sha",
      branchName: "codelens/verify/1/0",
      fix,
    });
    const call = octokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
    const written = Buffer.from(call.content, "base64").toString("utf-8");
    expect(written).toBe("line1\nconst x = 2;\nconst y = 3;\nline3");
    expect(call.sha).toBe("blob-sha-1");
    expect(call.branch).toBe("codelens/verify/1/0");
    expect(call.path).toBe("src/a.ts");
  });

  it("returns the branch name and new commit sha", async () => {
    const octokit = fakeOctokit(["line1", "line2", "line3"]);
    const result = await applyCandidateFixToBranch(octokit as never, {
      owner: "acme",
      repo: "widgets",
      baseSha: "base-sha",
      branchName: "codelens/verify/1/0",
      fix,
    });
    expect(result).toEqual({ branch: "codelens/verify/1/0", commitSha: "commit-sha-1" });
  });

  it("throws if the path is a directory, not a file", async () => {
    const octokit = fakeOctokit(["line1"]);
    octokit.rest.repos.getContent.mockResolvedValue({ data: [] });
    await expect(
      applyCandidateFixToBranch(octokit as never, {
        owner: "acme",
        repo: "widgets",
        baseSha: "base-sha",
        branchName: "codelens/verify/1/0",
        fix,
      }),
    ).rejects.toThrow(/not a file/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/verify/__tests__/apply-patch.test.ts`
Expected: FAIL — `Cannot find module '../apply-patch'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/verify/apply-patch.ts`:
```typescript
import type { Octokit } from "@octokit/rest";
import type { CandidateFix } from "./types";

export async function applyCandidateFixToBranch(
  octokit: Octokit,
  params: { owner: string; repo: string; baseSha: string; branchName: string; fix: CandidateFix },
): Promise<{ branch: string; commitSha: string }> {
  const { owner, repo, baseSha, branchName, fix } = params;

  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });

  const { data: fileData } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: fix.file,
    ref: branchName,
  });

  if (Array.isArray(fileData) || fileData.type !== "file") {
    throw new Error(`${fix.file} is not a file`);
  }

  const original = Buffer.from(fileData.content, "base64").toString("utf-8");
  const lines = original.split("\n");
  const before = lines.slice(0, fix.lineStart - 1);
  const after = lines.slice(fix.lineEnd);
  const updated = [...before, ...fix.replacement.split("\n"), ...after].join("\n");

  const { data: commitData } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: fix.file,
    message: `codelens: candidate fix for ${fix.file}`,
    content: Buffer.from(updated, "utf-8").toString("base64"),
    sha: fileData.sha,
    branch: branchName,
  });

  return { branch: branchName, commitSha: commitData.commit.sha as string };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/verify/__tests__/apply-patch.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/verify/apply-patch.ts src/lib/verify/__tests__/apply-patch.test.ts
git commit -m "feat: apply candidate fixes to disposable verify branches"
```

---

### Task 8: Verify workflow template and setup-PR creator

**Files:**
- Create: `src/lib/github/setup-workflow.ts`
- Test: `src/lib/github/__tests__/setup-workflow.test.ts`

**Interfaces:**
- Produces: `VERIFY_WORKFLOW_PATH: string`, `VERIFY_WORKFLOW_CONTENT: string`, `ensureVerifyWorkflow(octokit, owner: string, repo: string): Promise<"exists" | "pr-opened">` — consumed by the webhook route (Task 12).

- [ ] **Step 1: Write the failing test**

Create `src/lib/github/__tests__/setup-workflow.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { ensureVerifyWorkflow, VERIFY_WORKFLOW_PATH } from "../setup-workflow";

function fakeOctokit() {
  return {
    rest: {
      repos: {
        getContent: vi.fn(),
        get: vi.fn().mockResolvedValue({ data: { default_branch: "main" } }),
        createOrUpdateFileContents: vi.fn().mockResolvedValue({}),
      },
      git: {
        getRef: vi.fn().mockResolvedValue({ data: { object: { sha: "main-sha" } } }),
        createRef: vi.fn().mockResolvedValue({}),
      },
      pulls: {
        create: vi.fn().mockResolvedValue({}),
      },
    },
  };
}

describe("ensureVerifyWorkflow", () => {
  it("returns 'exists' and does nothing when the workflow file is already present", async () => {
    const octokit = fakeOctokit();
    octokit.rest.repos.getContent.mockResolvedValue({ data: { type: "file", sha: "x" } });

    const result = await ensureVerifyWorkflow(octokit as never, "acme", "widgets");

    expect(result).toBe("exists");
    expect(octokit.rest.pulls.create).not.toHaveBeenCalled();
  });

  it("opens a setup PR when the workflow file is missing", async () => {
    const octokit = fakeOctokit();
    octokit.rest.repos.getContent.mockRejectedValue({ status: 404 });

    const result = await ensureVerifyWorkflow(octokit as never, "acme", "widgets");

    expect(result).toBe("pr-opened");
    expect(octokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      ref: "refs/heads/codelens/setup-verify-workflow",
      sha: "main-sha",
    });
    expect(octokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ path: VERIFY_WORKFLOW_PATH, branch: "codelens/setup-verify-workflow" }),
    );
    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "acme", repo: "widgets", head: "codelens/setup-verify-workflow", base: "main" }),
    );
  });

  it("rethrows non-404 errors from getContent", async () => {
    const octokit = fakeOctokit();
    octokit.rest.repos.getContent.mockRejectedValue({ status: 500 });

    await expect(ensureVerifyWorkflow(octokit as never, "acme", "widgets")).rejects.toEqual({ status: 500 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/__tests__/setup-workflow.test.ts`
Expected: FAIL — `Cannot find module '../setup-workflow'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/github/setup-workflow.ts`:
```typescript
import type { Octokit } from "@octokit/rest";

export const VERIFY_WORKFLOW_PATH = ".github/workflows/codelens-verify.yml";
const SETUP_BRANCH = "codelens/setup-verify-workflow";

export const VERIFY_WORKFLOW_CONTENT = `on:
  workflow_dispatch:
    inputs:
      ref:
        required: true
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ inputs.ref }}
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
`;

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: unknown }).status === 404;
}

export async function ensureVerifyWorkflow(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<"exists" | "pr-opened"> {
  try {
    await octokit.rest.repos.getContent({ owner, repo, path: VERIFY_WORKFLOW_PATH });
    return "exists";
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
  }

  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  const { data: refData } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` });
  const baseSha = refData.object.sha;

  await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${SETUP_BRANCH}`, sha: baseSha });

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: VERIFY_WORKFLOW_PATH,
    message: "chore: add CodeLens verify workflow",
    content: Buffer.from(VERIFY_WORKFLOW_CONTENT, "utf-8").toString("base64"),
    branch: SETUP_BRANCH,
  });

  await octokit.rest.pulls.create({
    owner,
    repo,
    title: "Add CodeLens verify workflow",
    head: SETUP_BRANCH,
    base: defaultBranch,
    body: "CodeLens needs this workflow to run your test suite against candidate fixes before suggesting them. Merge to enable verified fix suggestions on future pull requests.",
  });

  return "pr-opened";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/__tests__/setup-workflow.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/setup-workflow.ts src/lib/github/__tests__/setup-workflow.test.ts
git commit -m "feat: auto-install verify workflow into repos via setup PR"
```

---

### Task 9: Dispatch verification orchestrator

**Files:**
- Create: `src/lib/verify/orchestrator.ts`
- Test: `src/lib/verify/__tests__/orchestrator.test.ts`

**Interfaces:**
- Consumes: `applyCandidateFixToBranch` (Task 7), `savePendingVerification` (Task 6), `CandidateFix` (Task 1).
- Produces: `MAX_CANDIDATES_PER_PR: number`, `dispatchVerification(octokit, params: { owner: string; repo: string; installationId: number; prNumber: number; headSha: string; fix: CandidateFix; index: number }): Promise<void>` — consumed by the webhook route (Task 12).

- [ ] **Step 1: Write the failing test**

Create `src/lib/verify/__tests__/orchestrator.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CandidateFix } from "../types";

const applyCandidateFixToBranchMock = vi.fn();
const savePendingVerificationMock = vi.fn();

vi.mock("../apply-patch", () => ({
  applyCandidateFixToBranch: applyCandidateFixToBranchMock,
}));
vi.mock("../pending-store", () => ({
  savePendingVerification: savePendingVerificationMock,
}));

const fix: CandidateFix = {
  id: "fix-1",
  file: "src/a.ts",
  lineStart: 1,
  lineEnd: 1,
  replacement: "const x = 1;",
  explanation: "fix",
};

describe("dispatchVerification", () => {
  beforeEach(() => {
    vi.resetModules();
    applyCandidateFixToBranchMock.mockReset();
    savePendingVerificationMock.mockReset();
    applyCandidateFixToBranchMock.mockResolvedValue({ branch: "codelens/verify/7/0", commitSha: "c1" });
  });

  it("applies the fix, dispatches the workflow, and saves a pending record", async () => {
    const { dispatchVerification } = await import("../orchestrator");
    const createWorkflowDispatch = vi.fn().mockResolvedValue({});
    const octokit = { rest: { actions: { createWorkflowDispatch } } };

    await dispatchVerification(octokit as never, {
      owner: "acme",
      repo: "widgets",
      installationId: 42,
      prNumber: 7,
      headSha: "head-sha",
      fix,
      index: 0,
    });

    expect(applyCandidateFixToBranchMock).toHaveBeenCalledWith(octokit, {
      owner: "acme",
      repo: "widgets",
      baseSha: "head-sha",
      branchName: "codelens/verify/7/0",
      fix,
    });

    expect(createWorkflowDispatch).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      workflow_id: "codelens-verify.yml",
      ref: "codelens/verify/7/0",
      inputs: { ref: "codelens/verify/7/0" },
    });

    expect(savePendingVerificationMock).toHaveBeenCalledWith({
      branch: "codelens/verify/7/0",
      owner: "acme",
      repo: "widgets",
      installationId: 42,
      prNumber: 7,
      file: "src/a.ts",
      lineStart: 1,
      lineEnd: 1,
      replacement: "const x = 1;",
      explanation: "fix",
      headShaAtDispatch: "head-sha",
      createdAt: expect.any(Number),
    });
  });
});

describe("MAX_CANDIDATES_PER_PR", () => {
  it("caps candidates at 5", async () => {
    const { MAX_CANDIDATES_PER_PR } = await import("../orchestrator");
    expect(MAX_CANDIDATES_PER_PR).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/verify/__tests__/orchestrator.test.ts`
Expected: FAIL — `Cannot find module '../orchestrator'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/verify/orchestrator.ts`:
```typescript
import type { Octokit } from "@octokit/rest";
import { applyCandidateFixToBranch } from "./apply-patch";
import { savePendingVerification } from "./pending-store";
import type { CandidateFix } from "./types";

export const MAX_CANDIDATES_PER_PR = 5;

export async function dispatchVerification(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    installationId: number;
    prNumber: number;
    headSha: string;
    fix: CandidateFix;
    index: number;
  },
): Promise<void> {
  const { owner, repo, installationId, prNumber, headSha, fix, index } = params;
  const branchName = `codelens/verify/${prNumber}/${index}`;

  await applyCandidateFixToBranch(octokit, {
    owner,
    repo,
    baseSha: headSha,
    branchName,
    fix,
  });

  await octokit.rest.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: "codelens-verify.yml",
    ref: branchName,
    inputs: { ref: branchName },
  });

  await savePendingVerification({
    branch: branchName,
    owner,
    repo,
    installationId,
    prNumber,
    file: fix.file,
    lineStart: fix.lineStart,
    lineEnd: fix.lineEnd,
    replacement: fix.replacement,
    explanation: fix.explanation,
    headShaAtDispatch: headSha,
    createdAt: Date.now(),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/verify/__tests__/orchestrator.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/verify/orchestrator.ts src/lib/verify/__tests__/orchestrator.test.ts
git commit -m "feat: dispatch candidate-fix verification workflows"
```

---

### Task 10: PR comment posting — verified suggestions and informational fallback

**Files:**
- Create: `src/lib/github/post-comment.ts`
- Test: `src/lib/github/__tests__/post-comment.test.ts`

**Interfaces:**
- Consumes: `CandidateFix` (Task 1).
- Produces: `postSuggestionComment(octokit, params: { owner: string; repo: string; prNumber: number; commitSha: string; fix: CandidateFix }): Promise<void>`, `postInformationalComment(octokit, params: { owner: string; repo: string; prNumber: number; fixes: CandidateFix[] }): Promise<void>` — consumed by the result handler (Task 11) and webhook route (Task 12).

- [ ] **Step 1: Write the failing test**

Create `src/lib/github/__tests__/post-comment.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { postSuggestionComment, postInformationalComment } from "../post-comment";
import type { CandidateFix } from "@/lib/verify/types";

const fix: CandidateFix = {
  id: "fix-1",
  file: "src/a.ts",
  lineStart: 3,
  lineEnd: 4,
  replacement: "const x = 1;\nconst y = 2;",
  explanation: "fixes the off-by-one",
};

describe("postSuggestionComment", () => {
  it("posts a multi-line suggestion block anchored to the fix's range", async () => {
    const createReviewComment = vi.fn().mockResolvedValue({});
    const octokit = { rest: { pulls: { createReviewComment } } };

    await postSuggestionComment(octokit as never, {
      owner: "acme",
      repo: "widgets",
      prNumber: 7,
      commitSha: "sha-1",
      fix,
    });

    expect(createReviewComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      pull_number: 7,
      commit_id: "sha-1",
      path: "src/a.ts",
      body: "fixes the off-by-one\n\n```suggestion\nconst x = 1;\nconst y = 2;\n```",
      line: 4,
      start_line: 3,
      start_side: "RIGHT",
      side: "RIGHT",
    });
  });

  it("omits start_line for a single-line fix", async () => {
    const createReviewComment = vi.fn().mockResolvedValue({});
    const octokit = { rest: { pulls: { createReviewComment } } };
    const singleLineFix: CandidateFix = { ...fix, lineStart: 3, lineEnd: 3 };

    await postSuggestionComment(octokit as never, {
      owner: "acme",
      repo: "widgets",
      prNumber: 7,
      commitSha: "sha-1",
      fix: singleLineFix,
    });

    const call = createReviewComment.mock.calls[0][0];
    expect(call.start_line).toBeUndefined();
    expect(call.line).toBe(3);
  });
});

describe("postInformationalComment", () => {
  it("posts a single labeled comment listing every fix", async () => {
    const createComment = vi.fn().mockResolvedValue({});
    const octokit = { rest: { issues: { createComment } } };

    await postInformationalComment(octokit as never, {
      owner: "acme",
      repo: "widgets",
      prNumber: 7,
      fixes: [fix],
    });

    expect(createComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      issue_number: 7,
      body: expect.stringContaining("unverified"),
    });
    const body = createComment.mock.calls[0][0].body;
    expect(body).toContain("src/a.ts:3-4");
    expect(body).toContain("fixes the off-by-one");
  });

  it("does nothing when there are no fixes", async () => {
    const createComment = vi.fn();
    const octokit = { rest: { issues: { createComment } } };

    await postInformationalComment(octokit as never, {
      owner: "acme",
      repo: "widgets",
      prNumber: 7,
      fixes: [],
    });

    expect(createComment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/__tests__/post-comment.test.ts`
Expected: FAIL — `Cannot find module '../post-comment'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/github/post-comment.ts`:
```typescript
import type { Octokit } from "@octokit/rest";
import type { CandidateFix } from "@/lib/verify/types";

export async function postSuggestionComment(
  octokit: Octokit,
  params: { owner: string; repo: string; prNumber: number; commitSha: string; fix: CandidateFix },
): Promise<void> {
  const { owner, repo, prNumber, commitSha, fix } = params;
  const body = `${fix.explanation}\n\n\`\`\`suggestion\n${fix.replacement}\n\`\`\``;

  const params_: Record<string, unknown> = {
    owner,
    repo,
    pull_number: prNumber,
    commit_id: commitSha,
    path: fix.file,
    body,
    line: fix.lineEnd,
    side: "RIGHT",
  };

  if (fix.lineEnd > fix.lineStart) {
    params_.start_line = fix.lineStart;
    params_.start_side = "RIGHT";
  }

  await octokit.rest.pulls.createReviewComment(
    params_ as Parameters<typeof octokit.rest.pulls.createReviewComment>[0],
  );
}

export async function postInformationalComment(
  octokit: Octokit,
  params: { owner: string; repo: string; prNumber: number; fixes: CandidateFix[] },
): Promise<void> {
  const { owner, repo, prNumber, fixes } = params;
  if (fixes.length === 0) {
    return;
  }

  const body = [
    "**CodeLens review (unverified — no test suite detected, fixes were not auto-run):**",
    "",
    ...fixes.map((f) => `- \`${f.file}:${f.lineStart}-${f.lineEnd}\` — ${f.explanation}`),
  ].join("\n");

  await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/__tests__/post-comment.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/post-comment.ts src/lib/github/__tests__/post-comment.test.ts
git commit -m "feat: post verified suggestions and informational fallback comments"
```

---

### Task 11: Workflow-run result handler

**Files:**
- Create: `src/lib/verify/result-handler.ts`
- Test: `src/lib/verify/__tests__/result-handler.test.ts`

**Interfaces:**
- Consumes: `getPendingVerification`, `deletePendingVerification` (Task 6), `postSuggestionComment` (Task 10).
- Produces: `handleWorkflowRunCompleted(octokit, params: { owner: string; repo: string; branchName: string; conclusion: string }): Promise<"posted" | "dropped" | "stale" | "not-found">` — consumed by the webhook route (Task 12).

- [ ] **Step 1: Write the failing test**

Create `src/lib/verify/__tests__/result-handler.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PendingVerification } from "../types";

const getPendingVerificationMock = vi.fn();
const deletePendingVerificationMock = vi.fn();
const postSuggestionCommentMock = vi.fn();

vi.mock("../pending-store", () => ({
  getPendingVerification: getPendingVerificationMock,
  deletePendingVerification: deletePendingVerificationMock,
}));
vi.mock("@/lib/github/post-comment", () => ({
  postSuggestionComment: postSuggestionCommentMock,
}));

const record: PendingVerification = {
  branch: "codelens/verify/7/0",
  owner: "acme",
  repo: "widgets",
  installationId: 42,
  prNumber: 7,
  file: "src/a.ts",
  lineStart: 1,
  lineEnd: 1,
  replacement: "const x = 1;",
  explanation: "fix",
  headShaAtDispatch: "head-sha",
  createdAt: 1000,
};

function fakeOctokit(prHeadSha: string) {
  return {
    rest: {
      pulls: { get: vi.fn().mockResolvedValue({ data: { head: { sha: prHeadSha } } }) },
      git: { deleteRef: vi.fn().mockResolvedValue({}) },
    },
  };
}

describe("handleWorkflowRunCompleted", () => {
  beforeEach(() => {
    vi.resetModules();
    getPendingVerificationMock.mockReset();
    deletePendingVerificationMock.mockReset();
    postSuggestionCommentMock.mockReset();
  });

  it("returns 'not-found' and does nothing when there is no pending record", async () => {
    getPendingVerificationMock.mockResolvedValue(null);
    const { handleWorkflowRunCompleted } = await import("../result-handler");
    const octokit = fakeOctokit("head-sha");

    const result = await handleWorkflowRunCompleted(octokit as never, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "success",
    });

    expect(result).toBe("not-found");
    expect(postSuggestionCommentMock).not.toHaveBeenCalled();
  });

  it("returns 'stale' and cleans up when the PR head has moved on", async () => {
    getPendingVerificationMock.mockResolvedValue(record);
    const { handleWorkflowRunCompleted } = await import("../result-handler");
    const octokit = fakeOctokit("newer-sha");

    const result = await handleWorkflowRunCompleted(octokit as never, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "success",
    });

    expect(result).toBe("stale");
    expect(postSuggestionCommentMock).not.toHaveBeenCalled();
    expect(deletePendingVerificationMock).toHaveBeenCalledWith("codelens/verify/7/0");
  });

  it("returns 'dropped' and cleans up on a failing test run", async () => {
    getPendingVerificationMock.mockResolvedValue(record);
    const { handleWorkflowRunCompleted } = await import("../result-handler");
    const octokit = fakeOctokit("head-sha");

    const result = await handleWorkflowRunCompleted(octokit as never, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "failure",
    });

    expect(result).toBe("dropped");
    expect(postSuggestionCommentMock).not.toHaveBeenCalled();
    expect(deletePendingVerificationMock).toHaveBeenCalledWith("codelens/verify/7/0");
  });

  it("posts a suggestion and cleans up on a passing test run", async () => {
    getPendingVerificationMock.mockResolvedValue(record);
    const { handleWorkflowRunCompleted } = await import("../result-handler");
    const octokit = fakeOctokit("head-sha");

    const result = await handleWorkflowRunCompleted(octokit as never, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "success",
    });

    expect(result).toBe("posted");
    expect(postSuggestionCommentMock).toHaveBeenCalledWith(octokit, {
      owner: "acme",
      repo: "widgets",
      prNumber: 7,
      commitSha: "head-sha",
      fix: {
        id: "codelens/verify/7/0",
        file: "src/a.ts",
        lineStart: 1,
        lineEnd: 1,
        replacement: "const x = 1;",
        explanation: "fix",
      },
    });
    expect(deletePendingVerificationMock).toHaveBeenCalledWith("codelens/verify/7/0");
  });

  it("deletes the temp branch after every resolved outcome", async () => {
    getPendingVerificationMock.mockResolvedValue(record);
    const { handleWorkflowRunCompleted } = await import("../result-handler");
    const octokit = fakeOctokit("head-sha");

    await handleWorkflowRunCompleted(octokit as never, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "failure",
    });

    expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      ref: "heads/codelens/verify/7/0",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/verify/__tests__/result-handler.test.ts`
Expected: FAIL — `Cannot find module '../result-handler'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/verify/result-handler.ts`:
```typescript
import type { Octokit } from "@octokit/rest";
import { getPendingVerification, deletePendingVerification } from "./pending-store";
import { postSuggestionComment } from "@/lib/github/post-comment";

export async function handleWorkflowRunCompleted(
  octokit: Octokit,
  params: { owner: string; repo: string; branchName: string; conclusion: string },
): Promise<"posted" | "dropped" | "stale" | "not-found"> {
  const { owner, repo, branchName, conclusion } = params;

  const pending = await getPendingVerification(branchName);
  if (!pending) {
    return "not-found";
  }

  const cleanup = async () => {
    await deletePendingVerification(branchName);
    try {
      await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${branchName}` });
    } catch {
      // Branch already gone — nothing left to clean up.
    }
  };

  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: pending.prNumber });

  if (pr.head.sha !== pending.headShaAtDispatch) {
    await cleanup();
    return "stale";
  }

  if (conclusion !== "success") {
    await cleanup();
    return "dropped";
  }

  await postSuggestionComment(octokit, {
    owner,
    repo,
    prNumber: pending.prNumber,
    commitSha: pr.head.sha,
    fix: {
      id: branchName,
      file: pending.file,
      lineStart: pending.lineStart,
      lineEnd: pending.lineEnd,
      replacement: pending.replacement,
      explanation: pending.explanation,
    },
  });

  await cleanup();
  return "posted";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/verify/__tests__/result-handler.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/verify/result-handler.ts src/lib/verify/__tests__/result-handler.test.ts
git commit -m "feat: resolve verification results into posted or dropped fixes"
```

---

### Task 12: Webhook route — wire it all together, retire /api/review

**Files:**
- Create: `src/app/api/webhook/github/route.ts`
- Test: `src/app/api/webhook/github/__tests__/route.test.ts`
- Delete: `src/app/api/review/route.ts`
- Delete: `src/app/api/review/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `verifyGithubSignature` (Task 2), `createInstallationOctokit` (Task 3), `detectTestCommand` (Task 4), `reviewPullRequest` (Task 5), `dispatchVerification`/`MAX_CANDIDATES_PER_PR` (Task 9), `postInformationalComment` (Task 10), `handleWorkflowRunCompleted` (Task 11), `ensureVerifyWorkflow` (Task 8).
- Produces: `POST(req: NextRequest): Promise<NextResponse>`.

- [ ] **Step 1: Delete the retired snippet-review API and its test**

```bash
git rm src/app/api/review/route.ts src/app/api/review/__tests__/route.test.ts
```

- [ ] **Step 2: Write the failing test**

Create `src/app/api/webhook/github/__tests__/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "webhook-secret";

const ensureVerifyWorkflowMock = vi.fn();
const reviewPullRequestMock = vi.fn();
const dispatchVerificationMock = vi.fn();
const postInformationalCommentMock = vi.fn();
const handleWorkflowRunCompletedMock = vi.fn();

vi.mock("@/lib/github/app-client", () => ({
  createInstallationOctokit: vi.fn(() => fakeOctokit),
}));
vi.mock("@/lib/github/setup-workflow", () => ({
  ensureVerifyWorkflow: ensureVerifyWorkflowMock,
}));
vi.mock("@/lib/review/engine", () => ({
  reviewPullRequest: reviewPullRequestMock,
}));
vi.mock("@/lib/verify/orchestrator", () => ({
  dispatchVerification: dispatchVerificationMock,
  MAX_CANDIDATES_PER_PR: 5,
}));
vi.mock("@/lib/github/post-comment", () => ({
  postInformationalComment: postInformationalCommentMock,
  postSuggestionComment: vi.fn(),
}));
vi.mock("@/lib/verify/result-handler", () => ({
  handleWorkflowRunCompleted: handleWorkflowRunCompletedMock,
}));

const fakeOctokit = {
  rest: {
    pulls: { listFiles: vi.fn() },
    repos: { getContent: vi.fn() },
  },
};

function sign(payload: string) {
  return `sha256=${createHmac("sha256", SECRET).update(payload).digest("hex")}`;
}

function makeRequest(event: string, payload: unknown) {
  const body = JSON.stringify(payload);
  return new Request("http://localhost/api/webhook/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-hub-signature-256": sign(body),
    },
    body,
  });
}

describe("POST /api/webhook/github", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    process.env.GROQ_API_KEY = "groq-key";
    ensureVerifyWorkflowMock.mockReset().mockResolvedValue("exists");
    reviewPullRequestMock.mockReset().mockResolvedValue([]);
    dispatchVerificationMock.mockReset().mockResolvedValue(undefined);
    postInformationalCommentMock.mockReset().mockResolvedValue(undefined);
    handleWorkflowRunCompletedMock.mockReset().mockResolvedValue("posted");
    fakeOctokit.rest.pulls.listFiles.mockReset().mockResolvedValue({ data: [] });
    fakeOctokit.rest.repos.getContent.mockReset().mockResolvedValue({
      data: { type: "file", content: Buffer.from(JSON.stringify({ scripts: { test: "vitest run" } })).toString("base64") },
    });
    const mod = await import("../route");
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  afterEach(() => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GROQ_API_KEY;
  });

  it("returns 401 for an invalid signature", async () => {
    const body = JSON.stringify({ action: "created" });
    const req = new Request("http://localhost/api/webhook/github", {
      method: "POST",
      headers: { "content-type": "application/json", "x-github-event": "installation", "x-hub-signature-256": "sha256=bad" },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("installs the verify workflow into every repo on install", async () => {
    const req = makeRequest("installation", {
      action: "created",
      installation: { id: 1 },
      repositories: [{ full_name: "acme/widgets" }],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(ensureVerifyWorkflowMock).toHaveBeenCalledWith(fakeOctokit, "acme", "widgets");
  });

  it("dispatches verification for each candidate fix on pull_request opened", async () => {
    reviewPullRequestMock.mockResolvedValue([
      { id: "f1", file: "a.ts", lineStart: 1, lineEnd: 1, replacement: "x", explanation: "e" },
    ]);
    const req = makeRequest("pull_request", {
      action: "opened",
      installation: { id: 1 },
      repository: { name: "widgets", owner: { login: "acme" } },
      pull_request: { number: 7, head: { sha: "head-sha" } },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dispatchVerificationMock).toHaveBeenCalledTimes(1);
    expect(postInformationalCommentMock).not.toHaveBeenCalled();
  });

  it("posts an informational comment instead of dispatching when no test command is detected", async () => {
    fakeOctokit.rest.repos.getContent.mockResolvedValue({
      data: { type: "file", content: Buffer.from(JSON.stringify({ scripts: {} })).toString("base64") },
    });
    reviewPullRequestMock.mockResolvedValue([
      { id: "f1", file: "a.ts", lineStart: 1, lineEnd: 1, replacement: "x", explanation: "e" },
    ]);
    const req = makeRequest("pull_request", {
      action: "opened",
      installation: { id: 1 },
      repository: { name: "widgets", owner: { login: "acme" } },
      pull_request: { number: 7, head: { sha: "head-sha" } },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dispatchVerificationMock).not.toHaveBeenCalled();
    expect(postInformationalCommentMock).toHaveBeenCalledTimes(1);
  });

  it("resolves workflow_run completed events", async () => {
    const req = makeRequest("workflow_run", {
      action: "completed",
      installation: { id: 1 },
      repository: { name: "widgets", owner: { login: "acme" } },
      workflow_run: { head_branch: "codelens/verify/7/0", conclusion: "success" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(handleWorkflowRunCompletedMock).toHaveBeenCalledWith(fakeOctokit, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "success",
    });
  });

  it("returns 200 and ignores unhandled event types", async () => {
    const req = makeRequest("issues", { action: "opened" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/app/api/webhook/github/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 4: Write minimal implementation**

Create `src/app/api/webhook/github/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { verifyGithubSignature } from "@/lib/github/verify-signature";
import { createInstallationOctokit } from "@/lib/github/app-client";
import { ensureVerifyWorkflow } from "@/lib/github/setup-workflow";
import { reviewPullRequest } from "@/lib/review/engine";
import { detectTestCommand } from "@/lib/verify/detect-test-command";
import { dispatchVerification, MAX_CANDIDATES_PER_PR } from "@/lib/verify/orchestrator";
import { postInformationalComment } from "@/lib/github/post-comment";
import { handleWorkflowRunCompleted } from "@/lib/verify/result-handler";
import type { ReviewFileInput } from "@/lib/github/types";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret || !verifyGithubSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  const payload = JSON.parse(rawBody);

  if (event === "installation" && payload.action === "created") {
    const octokit = createInstallationOctokit(payload.installation.id);
    for (const repo of payload.repositories ?? []) {
      const [owner, name] = (repo.full_name as string).split("/");
      await ensureVerifyWorkflow(octokit, owner, name);
    }
    return NextResponse.json({ ok: true });
  }

  if (event === "pull_request" && ["opened", "synchronize"].includes(payload.action)) {
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const prNumber = payload.pull_request.number;
    const headSha = payload.pull_request.head.sha;
    const octokit = createInstallationOctokit(payload.installation.id);

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json({ ok: true, skipped: "no-groq-key" });
    }

    const { data: changedFiles } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber });
    const files: ReviewFileInput[] = [];
    for (const f of changedFiles) {
      if (f.status === "removed") continue;
      const { data: contentData } = await octokit.rest.repos.getContent({ owner, repo, path: f.filename, ref: headSha });
      if (Array.isArray(contentData) || contentData.type !== "file") continue;
      files.push({
        file: f.filename,
        content: Buffer.from(contentData.content, "base64").toString("utf-8"),
        patch: f.patch ?? "",
      });
    }

    const groq = new Groq({ apiKey: groqApiKey });
    const candidates = (await reviewPullRequest(groq, files)).slice(0, MAX_CANDIDATES_PER_PR);

    let testCommand: string | null = null;
    try {
      const { data: pkg } = await octokit.rest.repos.getContent({ owner, repo, path: "package.json", ref: headSha });
      if (!Array.isArray(pkg) && pkg.type === "file") {
        testCommand = detectTestCommand(Buffer.from(pkg.content, "base64").toString("utf-8"));
      }
    } catch {
      testCommand = null;
    }

    if (!testCommand) {
      await postInformationalComment(octokit, { owner, repo, prNumber, fixes: candidates });
      return NextResponse.json({ ok: true, skipped: "no-test-command" });
    }

    for (let index = 0; index < candidates.length; index++) {
      await dispatchVerification(octokit, {
        owner,
        repo,
        installationId: payload.installation.id,
        prNumber,
        headSha,
        fix: candidates[index],
        index,
      });
    }
    return NextResponse.json({ ok: true, dispatched: candidates.length });
  }

  if (event === "workflow_run" && payload.action === "completed") {
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const branchName = payload.workflow_run.head_branch;
    const conclusion = payload.workflow_run.conclusion;
    const octokit = createInstallationOctokit(payload.installation.id);

    const result = await handleWorkflowRunCompleted(octokit, { owner, repo, branchName, conclusion });
    return NextResponse.json({ ok: true, result });
  }

  return NextResponse.json({ ok: true, ignored: true });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/api/webhook/github/__tests__/route.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhook/github/route.ts src/app/api/webhook/github/__tests__/route.test.ts
git commit -m "feat: wire up GitHub webhook route, retire snippet-review API"
```

---

### Task 13: Retire the snippet UI, add the install landing page

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/__tests__/page.test.tsx`
- Modify: `README.md`
- Modify: `PRODUCT.md`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_GITHUB_APP_SLUG` env var (Task 1).
- Produces: nothing consumed by other tasks — this is the final task.

- [ ] **Step 1: Write the failing test**

Replace `src/app/__tests__/page.test.tsx`:
```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "../page";

describe("Home page", () => {
  it("renders the product name", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: /codelens/i })).toBeInTheDocument();
  });

  it("links to the GitHub App install page", () => {
    process.env.NEXT_PUBLIC_GITHUB_APP_SLUG = "codelens-review";
    render(<Page />);
    const link = screen.getByRole("link", { name: /install/i });
    expect(link).toHaveAttribute("href", "https://github.com/apps/codelens-review/installations/new");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/__tests__/page.test.tsx`
Expected: FAIL — the existing snippet-paste page has no "install" link and its heading text won't match once Step 3 replaces it, so this run should fail against the *current* `page.tsx` (no matching link role).

- [ ] **Step 3: Write minimal implementation**

Replace `src/app/page.tsx`:
```typescript
export default function Page() {
  const slug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "";
  const installUrl = `https://github.com/apps/${slug}/installations/new`;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center font-sans">
      <h1 className="text-4xl font-bold">CodeLens</h1>
      <p className="text-lg text-neutral-400">
        Reviews your pull requests and only suggests fixes that have already passed your test suite.
      </p>
      <a
        href={installUrl}
        className="rounded-md bg-green-600 px-6 py-3 font-mono text-sm font-semibold text-white hover:bg-green-500"
      >
        Install on GitHub
      </a>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/__tests__/page.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Rewrite README.md**

Replace `README.md`:
```markdown
# CodeLens

A GitHub App that reviews your pull requests and only suggests fixes that have already passed your project's test suite.

## How it works

1. Install the app on a repository. It opens a one-time setup PR adding `.github/workflows/codelens-verify.yml`.
2. On every pull request, CodeLens reviews the diff with Llama 3.3 70B and proposes candidate fixes.
3. Each candidate fix is committed to a disposable branch and run through your real `npm test` via GitHub Actions.
4. Only fixes that provably pass get posted back as one-click "suggested change" comments. Failing fixes are dropped without a trace.

If a repo has no detectable `npm test` script, CodeLens posts its findings as a plain, explicitly-unverified comment instead of skipping the PR entirely.

## Stack

- [Next.js 16](https://nextjs.org/) (App Router, Turbopack) — hosts the webhook receiver
- [Groq SDK](https://console.groq.com/) (Llama 3.3 70B Versatile) — the review engine
- `@octokit/rest` + `@octokit/auth-app` — GitHub App API access
- `@upstash/redis` — short-lived pending-verification state
- TypeScript, Vitest

## Setup

```bash
npm install
cp .env.local.example .env.local
# fill in the variables below
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|--------------|
| `GITHUB_APP_ID` | Yes | App ID from the GitHub App settings page |
| `GITHUB_APP_PRIVATE_KEY` | Yes | PEM private key from the GitHub App settings page (`\n`-escaped if stored as one line) |
| `GITHUB_WEBHOOK_SECRET` | Yes | Webhook secret configured on the GitHub App |
| `UPSTASH_REDIS_REST_URL` | Yes | From the Upstash Redis database (Vercel Marketplace) |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | From the Upstash Redis database (Vercel Marketplace) |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | Yes | The app's slug, used to build the install link |
| `GROQ_API_KEY` | Yes | API key from [console.groq.com](https://console.groq.com/) |

## Scope

v1 supports JavaScript/TypeScript repositories with an `npm test` script.

## License

MIT
```

- [ ] **Step 6: Rewrite PRODUCT.md**

Replace `PRODUCT.md`:
```markdown
---
register: product
---

# CodeLens — Verified PR Review Bot

Installs on a GitHub repo. Reviews every pull request with Llama 3.3, then proves each candidate fix by running the project's real `npm test` against it on a disposable branch before ever showing it to a human. Only fixes that provably pass are posted, as one-click suggestion comments.

## Stack
- Next.js 16 (App Router, Turbopack) — webhook receiver
- GitHub App (`@octokit/rest`, `@octokit/auth-app`)
- Upstash Redis — pending-verification state
- Groq SDK (Llama 3.3 70B)
- TypeScript

## Surface
GitHub App + one landing page with an install link. No dashboard, no auth beyond the GitHub App installation flow.

## Users
Maintainers of JS/TS repositories who want AI review suggestions they can trust without re-verifying by hand.
```

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/app/__tests__/page.test.tsx README.md PRODUCT.md
git commit -m "feat: replace snippet-paste UI with GitHub App install page"
```

---

### Task 14: Sweep stale verifications on a cron

**Files:**
- Create: `src/lib/verify/sweep.ts`
- Test: `src/lib/verify/__tests__/sweep.test.ts`
- Create: `src/app/api/cron/cleanup/route.ts`
- Test: `src/app/api/cron/cleanup/__tests__/route.test.ts`
- Create: `vercel.ts`

**Interfaces:**
- Consumes: `listPendingVerifications`, `deletePendingVerification` (Task 6), `createInstallationOctokit` (Task 3).
- Produces: `sweepStaleVerifications(getOctokit: (installationId: number) => Octokit, now?: number): Promise<number>`.

- [ ] **Step 1: Install the Vercel config package**

Run:
```bash
npm install @vercel/config
```
Expected: `package.json` gains `@vercel/config` under `dependencies`.

- [ ] **Step 2: Write the failing test for the sweep**

Create `src/lib/verify/__tests__/sweep.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PendingVerification } from "../types";

const listPendingVerificationsMock = vi.fn();
const deletePendingVerificationMock = vi.fn();

vi.mock("../pending-store", () => ({
  listPendingVerifications: listPendingVerificationsMock,
  deletePendingVerification: deletePendingVerificationMock,
}));

const staleRecord: PendingVerification = {
  branch: "codelens/verify/7/0",
  owner: "acme",
  repo: "widgets",
  installationId: 42,
  prNumber: 7,
  file: "src/a.ts",
  lineStart: 1,
  lineEnd: 1,
  replacement: "const x = 1;",
  explanation: "fix",
  headShaAtDispatch: "head-sha",
  createdAt: 0,
};

const freshRecord: PendingVerification = { ...staleRecord, branch: "codelens/verify/8/0", createdAt: 19 * 60 * 1000 };

describe("sweepStaleVerifications", () => {
  beforeEach(() => {
    listPendingVerificationsMock.mockReset();
    deletePendingVerificationMock.mockReset();
  });

  it("deletes the branch and record for verifications older than 20 minutes", async () => {
    listPendingVerificationsMock.mockResolvedValue([staleRecord]);
    const deleteRef = vi.fn().mockResolvedValue({});
    const getOctokit = vi.fn().mockReturnValue({ rest: { git: { deleteRef } } });
    const { sweepStaleVerifications } = await import("../sweep");

    const swept = await sweepStaleVerifications(getOctokit, 21 * 60 * 1000);

    expect(swept).toBe(1);
    expect(getOctokit).toHaveBeenCalledWith(42);
    expect(deleteRef).toHaveBeenCalledWith({ owner: "acme", repo: "widgets", ref: "heads/codelens/verify/7/0" });
    expect(deletePendingVerificationMock).toHaveBeenCalledWith("codelens/verify/7/0");
  });

  it("leaves verifications younger than 20 minutes alone", async () => {
    listPendingVerificationsMock.mockResolvedValue([freshRecord]);
    const getOctokit = vi.fn();
    const { sweepStaleVerifications } = await import("../sweep");

    const swept = await sweepStaleVerifications(getOctokit, 21 * 60 * 1000);

    expect(swept).toBe(0);
    expect(getOctokit).not.toHaveBeenCalled();
    expect(deletePendingVerificationMock).not.toHaveBeenCalled();
  });

  it("still deletes the record when the branch is already gone", async () => {
    listPendingVerificationsMock.mockResolvedValue([staleRecord]);
    const deleteRef = vi.fn().mockRejectedValue({ status: 404 });
    const getOctokit = vi.fn().mockReturnValue({ rest: { git: { deleteRef } } });
    const { sweepStaleVerifications } = await import("../sweep");

    const swept = await sweepStaleVerifications(getOctokit, 21 * 60 * 1000);

    expect(swept).toBe(1);
    expect(deletePendingVerificationMock).toHaveBeenCalledWith("codelens/verify/7/0");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/verify/__tests__/sweep.test.ts`
Expected: FAIL — `Cannot find module '../sweep'`

- [ ] **Step 4: Write the sweep implementation**

Create `src/lib/verify/sweep.ts`:
```typescript
import type { Octokit } from "@octokit/rest";
import { listPendingVerifications, deletePendingVerification } from "./pending-store";

const STALE_AFTER_MS = 20 * 60 * 1000;

export async function sweepStaleVerifications(
  getOctokit: (installationId: number) => Octokit,
  now: number = Date.now(),
): Promise<number> {
  const pending = await listPendingVerifications();
  let swept = 0;

  for (const record of pending) {
    if (now - record.createdAt < STALE_AFTER_MS) {
      continue;
    }

    const octokit = getOctokit(record.installationId);
    try {
      await octokit.rest.git.deleteRef({
        owner: record.owner,
        repo: record.repo,
        ref: `heads/${record.branch}`,
      });
    } catch {
      // Branch already gone — nothing left to clean up.
    }

    await deletePendingVerification(record.branch);
    swept++;
  }

  return swept;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/verify/__tests__/sweep.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing test for the cron route**

Create `src/app/api/cron/cleanup/__tests__/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sweepStaleVerificationsMock = vi.fn();

vi.mock("@/lib/verify/sweep", () => ({
  sweepStaleVerifications: sweepStaleVerificationsMock,
}));
vi.mock("@/lib/github/app-client", () => ({
  createInstallationOctokit: vi.fn(),
}));

describe("GET /api/cron/cleanup", () => {
  beforeEach(() => {
    vi.resetModules();
    sweepStaleVerificationsMock.mockReset().mockResolvedValue(2);
    process.env.CRON_SECRET = "cron-secret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns 401 without the correct bearer token", async () => {
    const { GET } = await import("../route");
    const req = new Request("http://localhost/api/cron/cleanup");
    const res = await GET(req as never);
    expect(res.status).toBe(401);
    expect(sweepStaleVerificationsMock).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns the count with a valid bearer token", async () => {
    const { GET } = await import("../route");
    const req = new Request("http://localhost/api/cron/cleanup", {
      headers: { authorization: "Bearer cron-secret" },
    });
    const res = await GET(req as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, swept: 2 });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run src/app/api/cron/cleanup/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 8: Write the cron route**

Create `src/app/api/cron/cleanup/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createInstallationOctokit } from "@/lib/github/app-client";
import { sweepStaleVerifications } from "@/lib/verify/sweep";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const swept = await sweepStaleVerifications(createInstallationOctokit);
  return NextResponse.json({ ok: true, swept });
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run src/app/api/cron/cleanup/__tests__/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 10: Configure the cron schedule**

Create `vercel.ts`:
```typescript
import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [{ path: "/api/cron/cleanup", schedule: "*/20 * * * *" }],
};
```

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json src/lib/verify/sweep.ts src/lib/verify/__tests__/sweep.test.ts src/app/api/cron/cleanup/route.ts src/app/api/cron/cleanup/__tests__/route.test.ts vercel.ts
git commit -m "feat: sweep stale verification branches on a cron"
```

---

## Manual Verification Checklist

Run once after Task 13, against a real GitHub App and a scratch repo (no automated CI covers this):

1. Register a GitHub App (permissions: PRs read/write, contents read/write, workflows write (required to commit files under .github/workflows/), actions read/write, checks read; subscribe to `installation`, `pull_request`, `workflow_run` events); point its webhook at the deployed `/api/webhook/github` URL.
2. Install it on a scratch JS/TS repo with an `npm test` script. Confirm a setup PR appears adding `.github/workflows/codelens-verify.yml`. Merge it.
3. Open a PR introducing a deliberate, fixable bug covered by an existing test. Confirm: a candidate fix gets dispatched (check the Actions tab for a `codelens-verify` run), and once it passes, a one-click suggestion comment appears on the PR.
4. Open a second PR introducing a bug where the "fix" the model proposes would break another test. Confirm no comment appears for that candidate.
5. Temporarily remove the repo's `scripts.test` entry, open a PR with an obvious bug, confirm a single plain-text comment appears labeled unverified, and no suggestion blocks are posted.
