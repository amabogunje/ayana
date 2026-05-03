import { NextRequest, NextResponse } from "next/server";
import { authenticate, createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await authenticate(email, password);
  if (!user) {
    return NextResponse.redirect(new URL("/system?error=invalid", request.url));
  }

  await createSession(user.id);
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
