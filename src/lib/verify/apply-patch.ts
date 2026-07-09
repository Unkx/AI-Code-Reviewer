import type { Octokit } from "@octokit/rest";
import type { CandidateFix } from "./types";

export async function applyCandidateFixToBranch(
  octokit: Octokit,
  params: { owner: string; repo: string; baseSha: string; branchName: string; fix: CandidateFix },
): Promise<{ branch: string; commitSha: string }> {
  const { owner, repo, baseSha, branchName, fix } = params;

  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });

  const { data: fileData } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: fix.file,
    ref: branchName,
  });

  if (Array.isArray(fileData) || fileData.type !== "file") {
    throw new Error(`${fix.file} is not a file`);
  }

  const original = Buffer.from(fileData.content, "base64").toString("utf-8");
  const lines = original.split("\n");
  const before = lines.slice(0, fix.lineStart - 1);
  const after = lines.slice(fix.lineEnd);
  const updated = [...before, ...fix.replacement.split("\n"), ...after].join("\n");

  const { data: commitData } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: fix.file,
    message: `codelens: candidate fix for ${fix.file}`,
    content: Buffer.from(updated, "utf-8").toString("base64"),
    sha: fileData.sha,
    branch: branchName,
  });

  return { branch: branchName, commitSha: commitData.commit.sha as string };
}
