import { NextRequest, NextResponse } from "next/server";
import { getOperatorUserFromRequest } from "@/lib/operator-auth";
import { listOperatorPermissions } from "@/lib/operator-permissions";

export async function GET(request: NextRequest) {
  const user = await getOperatorUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user,
    permissions: listOperatorPermissions(user.role),
  });
}
