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
