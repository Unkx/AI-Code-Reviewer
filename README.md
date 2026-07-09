# CodeLens

A GitHub App that reviews your pull requests and only suggests fixes that have already passed your project's test suite.

**Live:** [ai-code-reviewer-nu-indol.vercel.app](https://ai-code-reviewer-nu-indol.vercel.app/)

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
|----------|----------|------------|
| `GITHUB_APP_ID` | Yes | App ID from the GitHub App settings page |
| `GITHUB_APP_PRIVATE_KEY` | Yes | PEM private key from the GitHub App settings page (`\n`-escaped if stored as one line) |
| `GITHUB_WEBHOOK_SECRET` | Yes | Webhook secret configured on the GitHub App |
| `UPSTASH_REDIS_REST_URL` | Yes | From the Upstash Redis database (Vercel Marketplace) |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | From the Upstash Redis database (Vercel Marketplace) |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | Yes | The app's slug, used to build the install link |
| `CRON_SECRET` | Yes | Random secret; authorizes the stale-verification cleanup cron |
| `GROQ_API_KEY` | Yes | API key from [console.groq.com](https://console.groq.com/) |

## Scope

v1 supports JavaScript/TypeScript repositories with an `npm test` script.

## License

MIT
