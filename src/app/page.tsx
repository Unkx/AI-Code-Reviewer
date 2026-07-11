"use client";

import { useState, type CSSProperties } from "react";

const REPO_URL = "https://github.com/Unkx/AI-Code-Reviewer";

type Lang = "en" | "pl";

const copy = {
  en: {
    toggleLabel: "Switch to Polish",
    toggleShort: "PL",
    kicker: "GitHub App",
    heroLead:
      "Every suggested fix has already passed your tests.",
    heroBody:
      "CodeLens reviews pull requests with Llama 3.3, runs each candidate fix against your real test suite on a disposable branch, and only posts the ones that provably pass.",
    repo: "View source",
    cardBot: "codelens[bot]",
    cardStatus: "verified · 12s ago",
    cardFile: "src/lib/parse.ts",
    cardResult: "Tests passed — safe to merge",
    stepsTitle: "How it works",
    steps: [
      {
        n: "01",
        title: "Install",
        body: "One-click GitHub App install opens a setup PR adding the verify workflow.",
      },
      {
        n: "02",
        title: "Review",
        body: "Every pull request diff is reviewed by Llama 3.3 70B for candidate fixes.",
      },
      {
        n: "03",
        title: "Verify",
        body: "Each fix runs against your real npm test on a disposable branch via GitHub Actions.",
      },
      {
        n: "04",
        title: "Ship",
        body: "Only fixes that provably pass get posted as one-click suggestion comments.",
      },
    ],
    scope: "v1 supports JavaScript/TypeScript repos with an npm test script.",
    stack: "Next.js · Llama 3.3 70B · GitHub Actions · Upstash Redis",
    license: "MIT licensed",
  },
  pl: {
    toggleLabel: "Przełącz na angielski",
    toggleShort: "EN",
    kicker: "Aplikacja GitHub",
    heroLead: "Każda proponowana poprawka już przeszła Twoje testy.",
    heroBody:
      "CodeLens sprawdza pull requesty za pomocą Llama 3.3, uruchamia każdą kandydacką poprawkę na Twoim prawdziwym zestawie testów na tymczasowej gałęzi i publikuje tylko te, które faktycznie działają.",
    repo: "Zobacz kod źródłowy",
    cardBot: "codelens[bot]",
    cardStatus: "zweryfikowano · 12s temu",
    cardFile: "src/lib/parse.ts",
    cardResult: "Testy przeszły — bezpieczne do scalenia",
    stepsTitle: "Jak to działa",
    steps: [
      {
        n: "01",
        title: "Instalacja",
        body: "Jednoklikowa instalacja aplikacji GitHub otwiera PR konfigurujący workflow weryfikacji.",
      },
      {
        n: "02",
        title: "Analiza",
        body: "Każdy diff pull requesta jest sprawdzany przez Llama 3.3 70B w poszukiwaniu poprawek.",
      },
      {
        n: "03",
        title: "Weryfikacja",
        body: "Każda poprawka jest uruchamiana na Twoim prawdziwym npm test na tymczasowej gałęzi przez GitHub Actions.",
      },
      {
        n: "04",
        title: "Wysyłka",
        body: "Tylko poprawki, które faktycznie przechodzą testy, trafiają jako sugestie jednym kliknięciem.",
      },
    ],
    scope: "Wersja v1 obsługuje repozytoria JavaScript/TypeScript z skryptem npm test.",
    stack: "Next.js · Llama 3.3 70B · GitHub Actions · Upstash Redis",
    license: "Licencja MIT",
  },
} satisfies Record<Lang, unknown>;

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      className="check-animated shrink-0"
      aria-hidden="true"
    >
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Page() {
  const [lang, setLang] = useState<Lang>("en");
  const t = copy[lang];

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <h1 className="font-mono text-sm font-semibold tracking-tight text-[var(--foreground)]">
          CodeLens
        </h1>
        <button
          type="button"
          onClick={() => setLang(lang === "en" ? "pl" : "en")}
          aria-label={t.toggleLabel}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 font-mono text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--foreground)]"
        >
          {t.toggleShort}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-28 px-6 pb-28">
        <section className="grid items-center gap-12 pt-8 md:grid-cols-2 md:gap-8 md:pt-16">
          <div
            className="animate-fade-in-up flex flex-col items-start gap-6 text-left"
            style={{ "--stagger": 0 } as CSSProperties}
          >
            <span className="rounded-full border border-[var(--border)] px-3 py-1 font-mono text-xs text-[var(--text-secondary)]">
              {t.kicker}
            </span>
            <h2 className="text-balance text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-[var(--foreground)] sm:text-5xl">
              {t.heroLead}
            </h2>
            <p className="text-pretty max-w-[52ch] text-lg text-[var(--text-secondary)]">
              {t.heroBody}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <a
                href={REPO_URL}
                className="rounded-md bg-[var(--accent)] px-6 py-3 font-mono text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
              >
                {t.repo}
              </a>
            </div>
          </div>

          <div
            className="animate-fade-in-up relative"
            style={{ "--stagger": 1 } as CSSProperties}
          >
            <div className="relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/40">
              <div className="scanning-line" />
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] font-mono text-[10px] font-bold text-white">
                  CL
                </span>
                <span className="font-mono text-xs font-semibold text-[var(--foreground)]">
                  {t.cardBot}
                </span>
                <span className="font-mono text-xs text-[var(--text-tertiary)]">
                  {t.cardStatus}
                </span>
              </div>
              <div className="px-4 pt-3 font-mono text-xs text-[var(--text-tertiary)]">
                {t.cardFile}
              </div>
              <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed">
                <span className="block bg-[rgba(239,68,68,0.12)] px-2 -mx-2 text-[#F87171]">
                  - if (value = null) return;
                </span>
                <span className="block bg-[rgba(34,197,94,0.12)] px-2 -mx-2 text-[#4ADE80]">
                  + if (value == null) return;
                </span>
              </pre>
              <div className="animate-pulse-border flex items-center gap-2 border-t border-[var(--border)] px-4 py-3">
                <CheckIcon />
                <span className="font-mono text-xs text-[var(--text-secondary)]">
                  {t.cardResult}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-10 text-2xl font-bold tracking-[-0.01em] text-[var(--foreground)]">
            {t.stepsTitle}
          </h3>
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {t.steps.map((step, i) => (
              <div
                key={step.n}
                className="animate-fade-in-up flex flex-col gap-2 border-l border-[var(--border)] pl-4"
                style={{ "--stagger": i } as CSSProperties}
              >
                <span className="font-mono text-xs text-[var(--accent)]">{step.n}</span>
                <h4 className="font-semibold text-[var(--foreground)]">{step.title}</h4>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-10 font-mono text-xs text-[var(--text-tertiary)]">{t.scope}</p>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl border-t border-[var(--border)] px-6 py-8">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="font-mono text-xs text-[var(--text-tertiary)]">{t.stack}</p>
          <div className="flex items-center gap-4 font-mono text-xs text-[var(--text-tertiary)]">
            <span>{t.license}</span>
            <a
              href={REPO_URL}
              className="text-[var(--text-secondary)] transition-colors hover:text-[var(--foreground)]"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
