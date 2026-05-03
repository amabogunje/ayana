import { NextRequest, NextResponse } from "next/server";
import { getOperatorUserFromRequest } from "@/lib/operator-auth";
import { hasOperatorPermission } from "@/lib/operator-permissions";
import { updateOperatorInquiryStatus } from "@/lib/operator-service";
import { operatorInquiryStatusSchema } from "@/lib/operator-validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getOperatorUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasOperatorPermission(user.role, "inbox:write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const input = operatorInquiryStatusSchema.parse(body);
    const { id } = await params;
    const inquiry = await updateOperatorInquiryStatus(user.venueId, id, input.status, user.id);
    return NextResponse.json({ inquiry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update inquiry.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
