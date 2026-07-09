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
