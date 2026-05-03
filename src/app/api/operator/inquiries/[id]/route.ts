import { NextRequest, NextResponse } from "next/server";
import { getOperatorUserFromRequest } from "@/lib/operator-auth";
import { listOperatorPermissions } from "@/lib/operator-permissions";
import { getOperatorInquiry } from "@/lib/operator-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getOperatorUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = listOperatorPermissions(user.role);
  if (!permissions.includes("inbox:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const inquiry = await getOperatorInquiry(user.venueId, id);

  if (!inquiry) {
    return NextResponse.json({ error: "Inquiry not found." }, { status: 404 });
  }

  return NextResponse.json({ inquiry });
}
