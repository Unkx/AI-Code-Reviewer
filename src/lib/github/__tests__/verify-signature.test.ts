import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyGithubSignature } from "../verify-signature";

const SECRET = "test-secret";

function sign(payload: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

describe("verifyGithubSignature", () => {
  it("accepts a correctly signed payload", () => {
    const payload = JSON.stringify({ hello: "world" });
    expect(verifyGithubSignature(payload, sign(payload, SECRET), SECRET)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    const payload = JSON.stringify({ hello: "world" });
    expect(verifyGithubSignature(payload, sign(payload, "wrong-secret"), SECRET)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const payload = JSON.stringify({ hello: "world" });
    const signature = sign(payload, SECRET);
    expect(verifyGithubSignature(JSON.stringify({ hello: "mallory" }), signature, SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyGithubSignature("{}", null, SECRET)).toBe(false);
  });

  it("rejects a signature header missing the sha256= prefix", () => {
    const payload = "{}";
    const raw = createHmac("sha256", SECRET).update(payload).digest("hex");
    expect(verifyGithubSignature(payload, raw, SECRET)).toBe(false);
  });

  it("rejects a signature of the wrong length", () => {
    expect(verifyGithubSignature("{}", "sha256=abc", SECRET)).toBe(false);
  });
});
