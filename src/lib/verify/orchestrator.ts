import type { Octokit } from "@octokit/rest";
import { applyCandidateFixToBranch } from "./apply-patch";
import { savePendingVerification } from "./pending-store";
import type { CandidateFix } from "./types";

export const MAX_CANDIDATES_PER_PR = 5;

export async function dispatchVerification(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    installationId: number;
    prNumber: number;
    headSha: string;
    fix: CandidateFix;
    index: number;
  },
): Promise<void> {
  const { owner, repo, installationId, prNumber, headSha, fix, index } = params;
  const branchName = `codelens/verify/${prNumber}/${index}`;

  await applyCandidateFixToBranch(octokit, {
    owner,
    repo,
    baseSha: headSha,
    branchName,
    fix,
  });

  await octokit.rest.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: "codelens-verify.yml",
    ref: branchName,
    inputs: { ref: branchName },
  });

  await savePendingVerification({
    branch: branchName,
    owner,
    repo,
    installationId,
    prNumber,
    file: fix.file,
    lineStart: fix.lineStart,
    lineEnd: fix.lineEnd,
    replacement: fix.replacement,
    explanation: fix.explanation,
    headShaAtDispatch: headSha,
    createdAt: Date.now(),
  });
}
