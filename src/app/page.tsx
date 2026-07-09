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
