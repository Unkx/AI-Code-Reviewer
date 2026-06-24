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
| `GROQ_API_KEY` | Yes | API key from [console.groq.com](https://console.groq.com/) |

## Supported Languages

JavaScript, TypeScript, Python, Java, C#, C++, Go, Rust

## License

MIT
