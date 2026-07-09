import { NextRequest, NextResponse } from "next/server";
import { createInstallationOctokit } from "@/lib/github/app-client";
import { sweepStaleVerifications } from "@/lib/verify/sweep";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const swept = await sweepStaleVerifications(createInstallationOctokit);
  return NextResponse.json({ ok: true, swept });
}
