import type { Octokit } from "@octokit/rest";
import { listPendingVerifications, deletePendingVerification } from "./pending-store";

const STALE_AFTER_MS = 20 * 60 * 1000;

export async function sweepStaleVerifications(
  getOctokit: (installationId: number) => Octokit,
  now: number = Date.now(),
): Promise<number> {
  const pending = await listPendingVerifications();
  let swept = 0;

  for (const record of pending) {
    if (now - record.createdAt < STALE_AFTER_MS) {
      continue;
    }

    const octokit = getOctokit(record.installationId);
    try {
      await octokit.rest.git.deleteRef({
        owner: record.owner,
        repo: record.repo,
        ref: `heads/${record.branch}`,
      });
    } catch {
      // Branch already gone — nothing left to clean up.
    }

    await deletePendingVerification(record.branch);
    swept++;
  }

  return swept;
}
