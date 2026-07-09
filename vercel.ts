import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [{ path: "/api/cron/cleanup", schedule: "*/20 * * * *" }],
};
