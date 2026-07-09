# CodeLens

A little AI helper to fix code with auto detection.

Paste code, pick a language, and get senior-level feedback on bugs, security issues, code quality, and actionable suggestions — plus an auto-generated fix proposal you can apply in one click.

## Features

- **Code Review** — Bugs, security, quality, and suggestions from Llama 3.3 70B
- **Language Auto-Detection** — Detects mismatches between selected and actual language
- **Fix Proposals** — Corrected code generated automatically with copy/apply actions
- **Dark Dev-Tool UI** — JetBrains Mono + IBM Plex Sans, green accent, animated feedback

## Stack

- [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Groq SDK](https://console.groq.com/) (Llama 3.3 70B Versatile)
- TypeScript

## Getting Started

```bash
# Install dependencies
npm install

# Add your Groq API key
cp .env.example .env.local
# Edit .env.local and set GROQ_API_KEY=your_key_here

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_APP_ID` | Yes | App ID from the GitHub App settings page |
| `GITHUB_APP_PRIVATE_KEY` | Yes | PEM private key from the GitHub App settings page (`\n`-escaped if stored as one line) |
| `GITHUB_WEBHOOK_SECRET` | Yes | Webhook secret configured on the GitHub App |
| `UPSTASH_REDIS_REST_URL` | Yes | From the Upstash Redis database (Vercel Marketplace) |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | From the Upstash Redis database (Vercel Marketplace) |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | Yes | The app's slug, used to build the install link |
| `CRON_SECRET` | Yes | Random secret; authorizes the stale-verification cleanup cron (Task 14) |
| `GROQ_API_KEY` | Yes | API key from [console.groq.com](https://console.groq.com/) |

## Supported Languages

JavaScript, TypeScript, Python, Java, C#, C++, Go, Rust

## License

MIT
