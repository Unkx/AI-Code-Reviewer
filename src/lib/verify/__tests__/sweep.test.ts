import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PendingVerification } from "../types";

const listPendingVerificationsMock = vi.fn();
const deletePendingVerificationMock = vi.fn();

vi.mock("../pending-store", () => ({
  listPendingVerifications: listPendingVerificationsMock,
  deletePendingVerification: deletePendingVerificationMock,
}));

const staleRecord: PendingVerification = {
  branch: "codelens/verify/7/0",
  owner: "acme",
  repo: "widgets",
  installationId: 42,
  prNumber: 7,
  file: "src/a.ts",
  lineStart: 1,
  lineEnd: 1,
  replacement: "const x = 1;",
  explanation: "fix",
  headShaAtDispatch: "head-sha",
  createdAt: 0,
};

const freshRecord: PendingVerification = { ...staleRecord, branch: "codelens/verify/8/0", createdAt: 19 * 60 * 1000 };

describe("sweepStaleVerifications", () => {
  beforeEach(() => {
    listPendingVerificationsMock.mockReset();
    deletePendingVerificationMock.mockReset();
  });

  it("deletes the branch and record for verifications older than 20 minutes", async () => {
    listPendingVerificationsMock.mockResolvedValue([staleRecord]);
    const deleteRef = vi.fn().mockResolvedValue({});
    const getOctokit = vi.fn().mockReturnValue({ rest: { git: { deleteRef } } });
    const { sweepStaleVerifications } = await import("../sweep");

    const swept = await sweepStaleVerifications(getOctokit, 21 * 60 * 1000);

    expect(swept).toBe(1);
    expect(getOctokit).toHaveBeenCalledWith(42);
    expect(deleteRef).toHaveBeenCalledWith({ owner: "acme", repo: "widgets", ref: "heads/codelens/verify/7/0" });
    expect(deletePendingVerificationMock).toHaveBeenCalledWith("codelens/verify/7/0");
  });

  it("leaves verifications younger than 20 minutes alone", async () => {
    listPendingVerificationsMock.mockResolvedValue([freshRecord]);
    const getOctokit = vi.fn();
    const { sweepStaleVerifications } = await import("../sweep");

    const swept = await sweepStaleVerifications(getOctokit, 21 * 60 * 1000);

    expect(swept).toBe(0);
    expect(getOctokit).not.toHaveBeenCalled();
    expect(deletePendingVerificationMock).not.toHaveBeenCalled();
  });

  it("still deletes the record when the branch is already gone", async () => {
    listPendingVerificationsMock.mockResolvedValue([staleRecord]);
    const deleteRef = vi.fn().mockRejectedValue({ status: 404 });
    const getOctokit = vi.fn().mockReturnValue({ rest: { git: { deleteRef } } });
    const { sweepStaleVerifications } = await import("../sweep");

    const swept = await sweepStaleVerifications(getOctokit, 21 * 60 * 1000);

    expect(swept).toBe(1);
    expect(deletePendingVerificationMock).toHaveBeenCalledWith("codelens/verify/7/0");
  });
});
