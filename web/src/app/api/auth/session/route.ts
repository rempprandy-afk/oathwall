/**
 * GET /api/auth/session — who am I? Returns the authenticated tenant address,
 * or { address: null } when not logged in. Read-only, safe to poll.
 */
import { NextResponse } from "next/server";
import { isHostedMode } from "@oathwall/core";
import { tenantOf } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isHostedMode()) return NextResponse.json({ hosted: false, address: null });
  try {
    return NextResponse.json({ hosted: true, address: tenantOf(req) });
  } catch (e) {
    // ALWAYS JSON. A thrown handler becomes a text "Internal Server Error" page,
    // which the terminal reads as data and Safari reports as a parser error.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not read the session" },
      { status: 500 },
    );
  }
}
