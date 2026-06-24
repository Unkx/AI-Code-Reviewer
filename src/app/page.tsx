"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const LANGUAGES = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C#",
  "C++",
  "Go",
  "Rust",
  "Other",
];

type ReviewResult = {
  languageMismatch: boolean;
  detectedLanguage: string;
  bugs: string[];
  quality: string[];
  security: string[];
  suggestions: string[];
  fixedCode: string | null;
};

type SectionProps = {
  title: string;
  items: string[];
  icon: React.ReactNode;
  accentClass: string;
  index: number;
};

function Section({ title, items, icon, accentClass, index }: SectionProps) {
  if (!items?.length) return null;
  return (
    <div
      className="animate-fade-in-up group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-[border-color,background-color,box-shadow] duration-200 hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] hover:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.3)]"
      style={{ "--stagger": index } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className={`flex items-center justify-center w-7 h-7 rounded-lg transition-transform duration-200 group-hover:scale-110 ${accentClass}`}
        >
          {icon}
        </span>
        <h3 className="text-sm font-semibold tracking-wide uppercase text-[var(--foreground)] font-[family-name:var(--font-mono)]">
          {title}
        </h3>
        <span className="ml-auto text-xs font-medium text-[var(--text-tertiary)] tabular-nums">
          {items.length}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={`${title}-${i}-${item.slice(0, 32)}`}
            className="text-sm leading-relaxed text-[var(--text-secondary)] pl-3 border-l-2 border-[var(--border)] transition-[border-color,padding-left] duration-150 hover:border-[var(--border-hover)] hover:pl-4"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FixedCodeBlock({
  code,
  onApply,
}: {
  code: string;
  onApply: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const applyTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
      if (applyTimer.current) clearTimeout(applyTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable in insecure context */
    }
  }, [code]);

  const handleApply = useCallback(() => {
    onApply(code);
    setApplied(true);
    if (applyTimer.current) clearTimeout(applyTimer.current);
    applyTimer.current = setTimeout(() => setApplied(false), 2000);
  }, [code, onApply]);

  return (
    <div className="animate-fade-in-up mt-8 rounded-xl border border-[var(--accent)]/30 bg-[var(--surface)] overflow-hidden" style={{ "--stagger": 5 } as React.CSSProperties}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#22C55E]/15 text-[#86EFAC]">
            <WrenchIcon />
          </span>
          <h3 className="text-sm font-semibold tracking-wide uppercase text-[var(--foreground)] font-[family-name:var(--font-mono)]">
            Proposed Fix
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer px-2.5 py-1.5 rounded-md transition-all duration-150 hover:bg-[var(--accent)]/10"
            style={{ color: applied ? "#86EFAC" : "var(--accent)" }}
          >
            {applied ? <CheckIcon animated /> : <ApplyIcon />}
            {applied ? "Applied" : "Apply"}
          </button>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--foreground)] cursor-pointer transition-all duration-150 px-2.5 py-1.5 rounded-md hover:bg-[var(--muted)]"
          >
            {copied ? <CheckIcon animated /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="p-6 overflow-x-auto text-sm leading-loose font-[family-name:var(--font-mono)] text-[var(--text-secondary)] whitespace-pre-wrap break-words">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function BugIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2l1.88 1.88" /><path d="M14.12 3.88 16 2" /><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" /><path d="M6.53 9C4.6 8.8 3 7.1 3 5" /><path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" /><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" /><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" /><path d="M10 22h4" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon({ animated = false }: { animated?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={animated ? "check-animated text-[#86EFAC]" : ""}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ApplyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" /><path d="m19 12-7 7-7-7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function Home() {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("TypeScript");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleReview() {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleSwitchLanguage() {
    if (!result?.detectedLanguage) return;
    setLanguage(result.detectedLanguage);
    setResult(null);
  }

  function handleApplyFix(fixedCode: string) {
    setCode(fixedCode);
  }

  const totalFindings = result
    ? result.bugs.length +
      result.quality.length +
      result.security.length +
      result.suggestions.length
    : 0;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]" suppressHydrationWarning>
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center transition-shadow duration-200 hover:shadow-[0_0_12px_-2px_rgba(34,197,94,0.4)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m16 18 2 2 4-4" /><path d="M21 12V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
                <path d="m7.5 4.27 9 5.15" /><path d="M3.29 7 12 12l8.71-5" /><path d="M12 22V12" />
              </svg>
            </div>
            <span className="text-base font-semibold tracking-tight font-[family-name:var(--font-mono)]">CodeLens</span>
          </div>
          <span className="text-xs text-[var(--text-tertiary)] font-medium">v0.1</span>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-2xl font-bold tracking-tight mb-1.5 font-[family-name:var(--font-mono)]">
            Code Review
          </h1>
          <p className="text-sm text-[var(--text-secondary)] max-w-md">
            A little AI helper to fix code with auto detection. Paste a snippet
            and get feedback on bugs, security, quality, and actionable fixes.
          </p>
        </div>

        {/* Editor area */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label
              htmlFor="language-select"
              className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider"
            >
              Language
            </label>
            <div className="relative">
              <select
                id="language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="appearance-none bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 pr-8 text-sm font-medium text-[var(--foreground)] cursor-pointer transition-all duration-150 hover:border-[var(--border-hover)] focus:border-[var(--accent)] focus:outline-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
                <ChevronIcon />
              </span>
            </div>
          </div>

          <div className="relative">
            <label htmlFor="code-input" className="sr-only">
              Code to review
            </label>
            <div className="absolute top-3 left-4 flex items-center gap-1.5 z-10">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]/60" />
            </div>
            {loading && <div className="scanning-line" />}
            <textarea
              id="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="// paste your code here"
              className={`w-full h-72 bg-[var(--surface)] border rounded-xl pt-10 pb-4 px-4 font-[family-name:var(--font-mono)] text-sm leading-relaxed resize-none transition-all duration-200 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-hover)] focus:border-[var(--accent)] focus:outline-none ${loading ? "animate-pulse-border border-[var(--accent)]" : "border-[var(--border)]"}`}
            />
            {code.length > 0 && !loading && (
              <span className="absolute bottom-3 right-4 text-[10px] font-medium text-[var(--text-tertiary)] tabular-nums animate-fade-in">
                {code.split("\n").length} lines
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleReview}
              disabled={loading || !code.trim()}
              className="inline-flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0F172A] font-semibold text-sm px-5 py-2.5 rounded-lg cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97] hover:shadow-[0_2px_12px_-2px_rgba(34,197,94,0.4)]"
            >
              {loading ? (
                <>
                  <Spinner />
                  Analyzing…
                </>
              ) : (
                "Run Review"
              )}
            </button>

            {result && !result.languageMismatch && (
              <span className="text-xs text-[var(--text-tertiary)] font-medium tabular-nums animate-fade-in">
                {totalFindings} finding{totalFindings !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="animate-slide-in-down mt-6 flex items-start gap-2.5 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 px-4 py-3">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#EF4444"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
            <p className="text-sm text-[#FCA5A5]">{error}</p>
          </div>
        )}

        {/* Language mismatch warning */}
        {result?.languageMismatch && (
          <div className="animate-slide-in-down mt-6 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-5">
            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#F59E0B]/15 text-[#FCD34D] shrink-0 mt-0.5">
                <AlertTriangleIcon />
              </span>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#FCD34D]">
                  Did you mean {result.detectedLanguage}?
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  You selected <span className="font-medium text-[var(--foreground)]">{language}</span>, but
                  this code looks like <span className="font-medium text-[var(--foreground)]">{result.detectedLanguage}</span>.
                  Review was skipped to avoid inaccurate results.
                </p>
                <button
                  onClick={handleSwitchLanguage}
                  className="inline-flex items-center gap-1.5 mt-1 text-sm font-medium text-[#FCD34D] hover:text-[#FBBF24] cursor-pointer transition-colors duration-150"
                >
                  Yes, switch to {result.detectedLanguage} and re-analyze
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {result && !result.languageMismatch && (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Section
                title="Bugs"
                items={result.bugs}
                icon={<BugIcon />}
                accentClass="bg-[#EF4444]/15 text-[#FCA5A5]"
                index={0}
              />
              <Section
                title="Security"
                items={result.security}
                icon={<ShieldIcon />}
                accentClass="bg-[#F59E0B]/15 text-[#FCD34D]"
                index={1}
              />
              <Section
                title="Quality"
                items={result.quality}
                icon={<GaugeIcon />}
                accentClass="bg-[#3B82F6]/15 text-[#93C5FD]"
                index={2}
              />
              <Section
                title="Suggestions"
                items={result.suggestions}
                icon={<LightbulbIcon />}
                accentClass="bg-[#22C55E]/15 text-[#86EFAC]"
                index={3}
              />
            </div>

            {result.fixedCode && (
              <FixedCodeBlock code={result.fixedCode} onApply={handleApplyFix} />
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-[var(--border)]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
          <span>Powered by Llama 3.3 via Groq</span>
        </div>
      </footer>
    </main>
  );
}
