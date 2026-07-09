import type { Octokit } from "@octokit/rest";
import { getPendingVerification, deletePendingVerification } from "./pending-store";
import { postSuggestionComment } from "@/lib/github/post-comment";

export async function handleWorkflowRunCompleted(
  octokit: Octokit,
  params: { owner: string; repo: string; branchName: string; conclusion: string },
): Promise<"posted" | "dropped" | "stale" | "not-found"> {
  const { owner, repo, branchName, conclusion } = params;

  const pending = await getPendingVerification(branchName);
  if (!pending) {
    return "not-found";
  }

  const cleanup = async () => {
    await deletePendingVerification(branchName);
    try {
      await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${branchName}` });
    } catch {
      // Branch already gone — nothing left to clean up.
    }
  };

  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: pending.prNumber });

  if (pr.head.sha !== pending.headShaAtDispatch) {
    await cleanup();
    return "stale";
  }

  if (conclusion !== "success") {
    await cleanup();
    return "dropped";
  }

  try {
    await postSuggestionComment(octokit, {
      owner,
      repo,
      prNumber: pending.prNumber,
      commitSha: pr.head.sha,
      fix: {
        id: branchName,
        file: pending.file,
        lineStart: pending.lineStart,
        lineEnd: pending.lineEnd,
        replacement: pending.replacement,
        explanation: pending.explanation,
      },
    });
    return "posted";
  } catch (err) {
    console.error(`Failed to post suggestion for ${branchName}:`, err);
    throw err;
  } finally {
    await cleanup();
  }
}
