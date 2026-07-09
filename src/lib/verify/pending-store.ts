import { Redis } from "@upstash/redis";
import type { PendingVerification } from "./types";

const redis = Redis.fromEnv();
const TTL_SECONDS = 30 * 60;

function key(branch: string): string {
  return `verify:${branch}`;
}

export async function savePendingVerification(v: PendingVerification): Promise<void> {
  await redis.set(key(v.branch), v, { ex: TTL_SECONDS });
}

export async function getPendingVerification(branch: string): Promise<PendingVerification | null> {
  const value = await redis.get<PendingVerification>(key(branch));
  return value ?? null;
}

export async function deletePendingVerification(branch: string): Promise<void> {
  await redis.del(key(branch));
}

export async function listPendingVerifications(): Promise<PendingVerification[]> {
  const keys = await redis.keys("verify:*");
  if (keys.length === 0) {
    return [];
  }
  const values = await redis.mget<PendingVerification[]>(...keys);
  return values.filter((v): v is PendingVerification => v !== null);
}
