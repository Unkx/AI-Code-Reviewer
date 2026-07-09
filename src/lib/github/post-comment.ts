import type { Octokit } from "@octokit/rest";
import type { CandidateFix } from "@/lib/verify/types";

export async function postSuggestionComment(
  octokit: Octokit,
  params: { owner: string; repo: string; prNumber: number; commitSha: string; fix: CandidateFix },
): Promise<void> {
  const { owner, repo, prNumber, commitSha, fix } = params;
  const body = `${fix.explanation}\n\n\`\`\`suggestion\n${fix.replacement}\n\`\`\``;

  const params_: Record<string, unknown> = {
    owner,
    repo,
    pull_number: prNumber,
    commit_id: commitSha,
    path: fix.file,
    body,
    line: fix.lineEnd,
    side: "RIGHT",
  };

  if (fix.lineEnd > fix.lineStart) {
    params_.start_line = fix.lineStart;
    params_.start_side = "RIGHT";
  }

  await octokit.rest.pulls.createReviewComment(
    params_ as Parameters<typeof octokit.rest.pulls.createReviewComment>[0],
  );
}

export async function postInformationalComment(
  octokit: Octokit,
  params: { owner: string; repo: string; prNumber: number; fixes: CandidateFix[] },
): Promise<void> {
  const { owner, repo, prNumber, fixes } = params;
  if (fixes.length === 0) {
    return;
  }

  const body = [
    "**CodeLens review (unverified — no test suite detected, fixes were not auto-run):**",
    "",
    ...fixes.map((f) => `- \`${f.file}:${f.lineStart}-${f.lineEnd}\` — ${f.explanation}`),
  ].join("\n");

  await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
}
