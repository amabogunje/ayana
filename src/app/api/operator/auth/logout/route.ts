import { NextRequest, NextResponse } from "next/server";
import { clearOperatorSession } from "@/lib/operator-auth";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token =
    authorization?.toLowerCase().startsWith("bearer ") ? authorization.slice("bearer ".length) : null;

  await clearOperatorSession(token);
  return NextResponse.json({ success: true });
}
