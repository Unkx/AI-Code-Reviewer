import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyGithubSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expectedHex = createHmac("sha256", secret).update(payload).digest("hex");
  const expected = Buffer.from(expectedHex, "utf-8");
  const actual = Buffer.from(signatureHeader.slice("sha256=".length), "utf-8");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}
