import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const OctokitCtor = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: OctokitCtor,
}));
vi.mock("@octokit/auth-app", () => ({
  createAppAuth: "createAppAuth-marker",
}));

describe("createInstallationOctokit", () => {
  beforeEach(() => {
    vi.resetModules();
    OctokitCtor.mockReset();
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN KEY-----\\nabc\\n-----END KEY-----";
  });

  afterEach(() => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
  });

  it("builds an Octokit client authenticated as the installation", async () => {
    const { createInstallationOctokit } = await import("../app-client");
    createInstallationOctokit(999);

    expect(OctokitCtor).toHaveBeenCalledWith({
      authStrategy: "createAppAuth-marker",
      auth: {
        appId: "12345",
        privateKey: "-----BEGIN KEY-----\nabc\n-----END KEY-----",
        installationId: 999,
      },
    });
  });
});
