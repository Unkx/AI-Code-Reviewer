"use client";

import { useState } from "react";

const REPO_URL = "https://github.com/Unkx/AI-Code-Reviewer";

const copy = {
  en: {
    tagline:
      "Reviews your pull requests and only suggests fixes that have already passed your test suite.",
    install: "Install on GitHub",
    repo: "View source on GitHub",
    toggle: "PL",
  },
  pl: {
    tagline:
      "Sprawdza Twoje pull requesty i sugeruje wyłącznie poprawki, które przeszły Twój zestaw testów.",
    install: "Zainstaluj na GitHubie",
    repo: "Zobacz kod źródłowy na GitHubie",
    toggle: "EN",
  },
} as const;

export default function Page() {
  const [lang, setLang] = useState<"en" | "pl">("en");
  const slug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "";
  const installUrl = `https://github.com/apps/${slug}/installations/new`;
  const t = copy[lang];

  return (
    <main className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center font-sans">
      <button
        type="button"
        onClick={() => setLang(lang === "en" ? "pl" : "en")}
        className="absolute top-6 right-6 rounded-md border border-neutral-700 px-3 py-1 font-mono text-xs font-semibold text-neutral-400 hover:text-white"
      >
        {t.toggle}
      </button>
      <h1 className="text-4xl font-bold">CodeLens</h1>
      <p className="text-lg text-neutral-400">{t.tagline}</p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <a
          href={installUrl}
          className="rounded-md bg-green-600 px-6 py-3 font-mono text-sm font-semibold text-white hover:bg-green-500"
        >
          {t.install}
        </a>
        <a
          href={REPO_URL}
          className="rounded-md border border-neutral-700 px-6 py-3 font-mono text-sm font-semibold text-neutral-300 hover:text-white"
        >
          {t.repo}
        </a>
      </div>
    </main>
  );
}
