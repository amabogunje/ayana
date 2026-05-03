import { NextRequest, NextResponse } from "next/server";
import { getOperatorUserFromRequest } from "@/lib/operator-auth";
import { hasOperatorPermission } from "@/lib/operator-permissions";
import {
  deactivateOperatorVenueStaff,
  getOperatorVenueSettings,
  updateOperatorVenueStaff,
} from "@/lib/operator-service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getOperatorUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasOperatorPermission(user.role, "settings:write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const role = body.role === "VENUE_MANAGER" ? "VENUE_MANAGER" : "VENUE_AGENT";

    await updateOperatorVenueStaff(
      user.venueId,
      id,
      {
        fullName: String(body.fullName ?? "").trim(),
        email: String(body.email ?? "").trim(),
        role,
      },
      user.id,
    );

    const settings = await getOperatorVenueSettings(user.venueId);
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update staff user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getOperatorUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasOperatorPermission(user.role, "settings:write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    await deactivateOperatorVenueStaff(user.venueId, id, user.id);
    const settings = await getOperatorVenueSettings(user.venueId);
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove staff user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
