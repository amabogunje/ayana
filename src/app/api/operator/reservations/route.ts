import { NextRequest, NextResponse } from "next/server";
import { getOperatorUserFromRequest } from "@/lib/operator-auth";
import { hasOperatorPermission } from "@/lib/operator-permissions";
import { listOperatorReservations } from "@/lib/operator-service";

export async function GET(request: NextRequest) {
  const user = await getOperatorUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasOperatorPermission(user.role, "reservations:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reservations = await listOperatorReservations(user.venueId);
  return NextResponse.json({ reservations });
}
