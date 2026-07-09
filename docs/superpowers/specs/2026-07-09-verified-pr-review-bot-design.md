# CodeLens PR Bot — Verified Fix Suggestions

## Summary

Pivot CodeLens from a single-page "paste a snippet, get a review" tool into a GitHub App that reviews pull requests and posts fix suggestions — but only after running the project's own test suite against each candidate fix and confirming it passes. The verification loop is the differentiator: every suggestion that reaches a PR is a suggestion that has provably passed tests, not just an LLM's guess.

v1 scope: JavaScript/TypeScript repositories only (test command detected via `package.json` `scripts.test`). The existing snippet-paste UI is retired; this becomes the product.

## Architecture

```
GitHub PR event (opened/synchronize)
        │
        ▼
Webhook receiver (Next.js API route, Vercel-hosted)
        │
        ├─► Review engine (Groq/Llama) — reviews PR diff, produces candidate fixes
        │
        ▼
Verification orchestrator
        │  for each candidate fix:
        │    1. apply patch on a temp branch (Git Data API)
        │    2. dispatch codelens-verify.yml workflow on that branch
        │    3. store pending record (Redis, TTL'd)
        │
        ▼
GitHub Actions runner (in target repo, added via one-time setup PR)
        │  checkout ref → npm ci → npm test → conclusion
        ▼
workflow_run (completed) webhook
        │
        ├─► success → post inline GitHub suggestion-block comment on original PR
        └─► failure / no test script → drop silently, cleanup temp branch + record
```

## Components

### 1. GitHub App
Registered app with permissions: pull requests (read/write), contents (read/write), workflows (write — required to commit the verify workflow file), actions (read/write — required to dispatch it), checks (read). Installed per-repo by the user.

### 2. Webhook receiver — `src/app/api/webhook/github/route.ts`
Verifies GitHub's HMAC signature on every request. Handles:
- `installation` (created) — checks whether `.github/workflows/codelens-verify.yml` exists; if not, opens a setup PR adding it.
- `pull_request` (opened, synchronize) — kicks off a review job for the PR diff.
- `workflow_run` (completed) — resolves a pending verification record and posts or drops the result.

### 3. Review engine
Adapted from the current `src/app/api/review/route.ts` Groq integration. Input changes from a pasted snippet to a PR diff; output changes from a single `fixedCode` blob to a list of discrete candidate fixes, each with file path, line range, and a unified diff/patch. Reuses the existing pattern of a strict JSON response schema validated on the server (like today's `validateResult`).

### 4. Verification orchestrator
For each candidate fix:
1. Build a commit applying the patch on top of the PR head, on a new branch `codelens/verify/<pr>/<n>`, using the Git Data API (blob → tree → commit → ref) — no local clone needed.
2. Trigger `workflow_dispatch` on `codelens-verify.yml` with the new branch as the ref input.
3. Write a pending-verification record to Redis: `{ branch, prNumber, installationId, file, lineStart, lineEnd, patch, headShaAtDispatch }`, TTL ~30 min.

### 5. Injected workflow — `.github/workflows/codelens-verify.yml`
Template pushed via the one-time setup PR into the target repo:
```yaml
on:
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
          ref: ${{ inputs.ref }}
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
```
No custom result-reporting step needed — GitHub's own `workflow_run` webhook carries the run's conclusion (`success`/`failure`) and head branch, which is enough to match back to the pending record.

### 6. Result handler
On `workflow_run` completed:
- Look up the pending record by head branch.
- If the PR's head SHA has moved since dispatch (new commits pushed mid-verification), discard the result as stale.
- If conclusion is `success`, post an inline PR review comment using GitHub's suggestion-block syntax (```` ```suggestion ```` ) at the recorded file/line, so the author can one-click apply — mirrors today's "apply fix" UX.
- If conclusion is `failure`, or no test script existed, drop the candidate silently. No comment, no trace visible to the PR author.
- Either way, delete the temp branch and the Redis record.

### 7. Persistence
Upstash Redis (Vercel Marketplace) for pending-verification records. Ephemeral, TTL'd key-value is a natural fit — no need for a durable relational store.

## Error handling

- No `npm test` script detected in `package.json` → skip verification entirely for that PR; post the review findings (bugs/security/quality/suggestions) as a plain informational comment, explicitly labeled as unverified, with no auto-apply suggestion blocks.
- Setup PR not yet merged (workflow file missing) → same fallback as above.
- Groq API failure → log server-side only; no PR comment. Avoid surfacing infra failures to PR authors as noise.
- Patch fails to apply cleanly on the PR head → drop that candidate, continue with the others.
- `workflow_dispatch` never completes within ~15 minutes → drop candidate, clean up branch and record.
- Stale verification (PR head SHA changed mid-check) → discard result, do not post.

## Testing

- Unit tests (vitest, existing project convention): patch-apply logic, `package.json` test-command detection, webhook HMAC signature verification, review-response parsing/validation (extends the existing `validateResult`-style strict parsing).
- Integration test: mock GitHub REST/webhook payloads and the Groq API, drive one full PR-opened → candidate fixes → verify-dispatch → workflow_run-success → suggestion-comment flow, and one failure-path (test failure → silent drop) flow.
- No live-GitHub end-to-end test in CI (would need a real test org, app credentials, and a fixture repo). Instead, the plan will include a manual verification checklist: install the app on a scratch repo, open a PR with a deliberate bug, confirm a passing fix gets suggested and a failing one doesn't.

## Out of scope (v1)

- Non-JS/TS languages (Python, Go, etc.) — detection and runner setup differs enough to warrant its own follow-up.
- Showing rejected/failed candidates to the user in any form.
- Self-hosted or Vercel Sandbox execution — GitHub Actions runners only, per the PR-native trigger model.
- Retaining the old snippet-paste UI.
