import { NextRequest, NextResponse } from "next/server";
import { getOperatorUserFromRequest } from "@/lib/operator-auth";
import { hasOperatorPermission } from "@/lib/operator-permissions";
import {
  createOperatorVenueStaff,
  getOperatorVenueSettings,
  updateOperatorVenueSettings,
  uploadOperatorVenueAsset,
} from "@/lib/operator-service";
import { operatorVenueSettingsSchema } from "@/lib/operator-validation";
import { hasUploadedFile } from "@/lib/venue-assets";

export async function GET(request: NextRequest) {
  const user = await getOperatorUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasOperatorPermission(user.role, "settings:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getOperatorVenueSettings(user.venueId);
  return NextResponse.json({ settings });
}

export async function POST(request: NextRequest) {
  const user = await getOperatorUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasOperatorPermission(user.role, "settings:write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const input = operatorVenueSettingsSchema.parse({
        addressLine1: String(formData.get("addressLine1") ?? "").trim(),
        city: String(formData.get("city") ?? "").trim(),
        state: String(formData.get("state") ?? "").trim(),
        postalCode: String(formData.get("postalCode") ?? "").trim(),
        phoneNumber: String(formData.get("phoneNumber") ?? "").trim(),
        timezone: String(formData.get("timezone") ?? "").trim(),
        hoursSummary: String(formData.get("hoursSummary") ?? "").trim(),
        primaryOperatorName: String(formData.get("primaryOperatorName") ?? "").trim(),
        primaryOperatorRole: String(formData.get("primaryOperatorRole") ?? "").trim(),
        primaryOperatorEmail: String(formData.get("primaryOperatorEmail") ?? "").trim(),
        depositPolicy: String(formData.get("depositPolicy") ?? "").trim(),
        servesFood: formData.get("servesFood") === "on",
        servesHookah: formData.get("servesHookah") === "on",
        hasParking: formData.get("hasParking") === "on",
        hasValet: formData.get("hasValet") === "on",
        dressCodeSummary: String(formData.get("dressCodeSummary") ?? "").trim(),
        agePolicySummary: String(formData.get("agePolicySummary") ?? "").trim(),
        depositCheckoutMode: String(formData.get("depositCheckoutMode") ?? "MOCK").trim(),
        stripeConnectAccountId: String(formData.get("stripeConnectAccountId") ?? "").trim(),
        stripeOnboardingComplete: formData.get("stripeOnboardingComplete") === "on",
        stripeChargesEnabled: formData.get("stripeChargesEnabled") === "on",
        stripePayoutsEnabled: formData.get("stripePayoutsEnabled") === "on",
      });

      await updateOperatorVenueSettings(user.venueId, input, user.id);

      const bottleMenuFile = formData.get("bottleMenuFile");
      if (hasUploadedFile(bottleMenuFile)) {
        await uploadOperatorVenueAsset(
          user.venueId,
          { type: "BOTTLE_MENU", label: "Bottle menu", file: bottleMenuFile },
          user.id,
        );
      }

      const foodMenuFile = formData.get("foodMenuFile");
      if (hasUploadedFile(foodMenuFile)) {
        await uploadOperatorVenueAsset(
          user.venueId,
          { type: "FOOD_MENU", label: "Food menu", file: foodMenuFile },
          user.id,
        );
      }

      const hookahMenuFile = formData.get("hookahMenuFile");
      if (hasUploadedFile(hookahMenuFile)) {
        await uploadOperatorVenueAsset(
          user.venueId,
          { type: "HOOKAH_MENU", label: "Hookah menu", file: hookahMenuFile },
          user.id,
        );
      }

      const newStaffName = String(formData.get("newStaffName") ?? "").trim();
      const newStaffEmail = String(formData.get("newStaffEmail") ?? "").trim();
      const newStaffRoleValue = String(formData.get("newStaffRole") ?? "VENUE_AGENT").trim();
      let staffInviteUrl: string | null = null;
      const newStaffRole =
        newStaffRoleValue === "VENUE_OWNER" || newStaffRoleValue === "VENUE_MANAGER"
          ? newStaffRoleValue
          : "VENUE_AGENT";

      if (newStaffName || newStaffEmail) {
        const invitedStaff = await createOperatorVenueStaff(
          user.venueId,
          {
            fullName: newStaffName,
            email: newStaffEmail,
            role: newStaffRole,
          },
          user.id,
        );
        staffInviteUrl = invitedStaff.inviteUrl;
      }

      const settings = await getOperatorVenueSettings(user.venueId);
      return NextResponse.json({ settings, staffInviteUrl });
    }

    const body = await request.json();
    const input = operatorVenueSettingsSchema.parse(body);
    const settings = await updateOperatorVenueSettings(user.venueId, input, user.id);
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update settings.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
