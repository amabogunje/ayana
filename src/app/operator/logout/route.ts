import { NextRequest, NextResponse } from "next/server";
import { clearOperatorSession } from "@/lib/operator-auth";

export async function POST(request: NextRequest) {
  await clearOperatorSession();
  return NextResponse.redirect(new URL("/operator/login", request.url));
}
