import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PendingVerification } from "../types";

const redisMock = { set: vi.fn(), get: vi.fn(), del: vi.fn(), keys: vi.fn(), mget: vi.fn() };

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => redisMock },
}));

describe("pending-store", () => {
  beforeEach(() => {
    vi.resetModules();
    redisMock.set.mockReset();
    redisMock.get.mockReset();
    redisMock.del.mockReset();
    redisMock.keys.mockReset();
    redisMock.mget.mockReset();
  });

  const record: PendingVerification = {
    branch: "codelens/verify/1/0",
    owner: "acme",
    repo: "widgets",
    installationId: 42,
    prNumber: 1,
    file: "src/a.ts",
    lineStart: 1,
    lineEnd: 1,
    replacement: "const x = 1;",
    explanation: "fix",
    headShaAtDispatch: "abc123",
    createdAt: 1_000,
  };

  it("saves a record with a namespaced key and a TTL", async () => {
    const { savePendingVerification } = await import("../pending-store");
    await savePendingVerification(record);
    expect(redisMock.set).toHaveBeenCalledWith(`verify:${record.branch}`, record, { ex: 1800 });
  });

  it("reads a record back by branch", async () => {
    redisMock.get.mockResolvedValue(record);
    const { getPendingVerification } = await import("../pending-store");
    expect(await getPendingVerification(record.branch)).toEqual(record);
    expect(redisMock.get).toHaveBeenCalledWith(`verify:${record.branch}`);
  });

  it("returns null when no record exists", async () => {
    redisMock.get.mockResolvedValue(null);
    const { getPendingVerification } = await import("../pending-store");
    expect(await getPendingVerification("missing")).toBeNull();
  });

  it("deletes a record by branch", async () => {
    const { deletePendingVerification } = await import("../pending-store");
    await deletePendingVerification(record.branch);
    expect(redisMock.del).toHaveBeenCalledWith(`verify:${record.branch}`);
  });

  it("lists all pending records", async () => {
    redisMock.keys.mockResolvedValue([`verify:${record.branch}`]);
    redisMock.mget.mockResolvedValue([record]);
    const { listPendingVerifications } = await import("../pending-store");
    expect(await listPendingVerifications()).toEqual([record]);
    expect(redisMock.keys).toHaveBeenCalledWith("verify:*");
    expect(redisMock.mget).toHaveBeenCalledWith(`verify:${record.branch}`);
  });

  it("returns an empty array when nothing is pending", async () => {
    redisMock.keys.mockResolvedValue([]);
    const { listPendingVerifications } = await import("../pending-store");
    expect(await listPendingVerifications()).toEqual([]);
    expect(redisMock.mget).not.toHaveBeenCalled();
  });
});
