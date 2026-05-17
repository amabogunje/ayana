import { NextRequest, NextResponse } from "next/server";
import { processDueWorkflowTasks } from "@/lib/workflow-tasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readBearerToken(header: string | null) {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  return readBearerToken(request.headers.get("authorization")) === cronSecret;
}

function getLimit(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get("limit");
  if (!rawLimit) return undefined;

  const parsed = Number.parseInt(rawLimit, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function runWorkflowProcessor(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processDueWorkflowTasks({
    limit: getLimit(request),
  });

  return NextResponse.json({
    ok: true,
    outboundMessagesSent: 0,
    customerMessagingEnabled: false,
    ...result,
  });
}

export async function GET(request: NextRequest) {
  return runWorkflowProcessor(request);
}

export async function POST(request: NextRequest) {
  return runWorkflowProcessor(request);
}
