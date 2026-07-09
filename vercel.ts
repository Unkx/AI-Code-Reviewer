import type { VercelConfig } from "@vercel/config/v1";

// Hobby plan only allows daily cron jobs — this runs once/day instead of the
// originally-designed every-20-minutes cadence. Stale verify branches/records
// may take up to ~24h to clean up instead of ~20min; upgrade to Pro to restore
// the tighter schedule if that matters.
export const config: VercelConfig = {
  crons: [{ path: "/api/cron/cleanup", schedule: "0 3 * * *" }],
};
