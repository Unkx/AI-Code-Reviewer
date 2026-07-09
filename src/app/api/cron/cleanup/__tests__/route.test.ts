import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sweepStaleVerificationsMock = vi.fn();

vi.mock("@/lib/verify/sweep", () => ({
  sweepStaleVerifications: sweepStaleVerificationsMock,
}));
vi.mock("@/lib/github/app-client", () => ({
  createInstallationOctokit: vi.fn(),
}));

describe("GET /api/cron/cleanup", () => {
  beforeEach(() => {
    vi.resetModules();
    sweepStaleVerificationsMock.mockReset().mockResolvedValue(2);
    process.env.CRON_SECRET = "cron-secret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns 401 without the correct bearer token", async () => {
    const { GET } = await import("../route");
    const req = new Request("http://localhost/api/cron/cleanup");
    const res = await GET(req as never);
    expect(res.status).toBe(401);
    expect(sweepStaleVerificationsMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a literal 'Bearer undefined' header when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("../route");
    const req = new Request("http://localhost/api/cron/cleanup", {
      headers: { authorization: "Bearer undefined" },
    });
    const res = await GET(req as never);
    expect(res.status).toBe(401);
    expect(sweepStaleVerificationsMock).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns the count with a valid bearer token", async () => {
    const { GET } = await import("../route");
    const req = new Request("http://localhost/api/cron/cleanup", {
      headers: { authorization: "Bearer cron-secret" },
    });
    const res = await GET(req as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, swept: 2 });
  });
});
