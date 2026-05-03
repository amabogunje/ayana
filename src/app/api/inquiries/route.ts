import { NextRequest, NextResponse } from "next/server";
import { createInquiry, listActiveInquiries } from "@/lib/inquiry-service";

export async function GET() {
  const inquiries = await listActiveInquiries();
  return NextResponse.json({ inquiries });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inquiry = await createInquiry(body);
    return NextResponse.json({ inquiry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create inquiry";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
