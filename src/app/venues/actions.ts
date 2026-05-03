"use server";

import { redirect } from "next/navigation";
import { requirePlatformUser } from "@/lib/auth";
import {
  addVenueTableOption,
  createVenue,
  deleteVenueTableOption,
  getVenueOnboarding,
  updateVenueProfile,
  updateVenueState,
  updateVenueTableOption,
} from "@/lib/admin-service";
import { operatingDays, venueChannels } from "@/lib/venue-form-options";

function buildHoursSummary(formData: FormData) {
  const segments = operatingDays.flatMap((day) => {
    const open = formData.get(`open_${day.key}`) === "on";
    if (!open) return [];

    const start = String(formData.get(`start_${day.key}`) ?? "").trim();
    const end = String(formData.get(`end_${day.key}`) ?? "").trim();
    if (!start || !end) return [];

    return [`${day.label} ${start}-${end}`];
  });

  return segments.join(" · ");
}

function buildChannelsSummary(formData: FormData) {
  return formData
    .getAll("channels")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((value) => venueChannels.find((channel) => channel.value === value)?.label ?? value)
    .join(", ");
}

export async function createVenueAction(formData: FormData) {
  const actor = await requirePlatformUser();
  const name = String(formData.get("name") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const channelsSummary = buildChannelsSummary(formData);
  const hoursSummary = buildHoursSummary(formData);
  const brandTone = String(formData.get("brandTone") ?? "").trim();
  const depositPolicy = "Pending venue configuration";

  if (
    !name ||
    !addressLine1 ||
    !city ||
    !state ||
    !postalCode ||
    !phoneNumber ||
    !timezone ||
    !channelsSummary ||
    !brandTone
  ) {
    redirect("/venues?error=missing-fields");
  }

  await createVenue(
    {
      name,
      addressLine1,
      city,
      state,
      postalCode,
      phoneNumber,
      timezone,
      channelsSummary,
      hoursSummary,
      primaryOperatorName: String(formData.get("primaryOperatorName") ?? "").trim(),
      primaryOperatorRole: String(formData.get("primaryOperatorRole") ?? "").trim(),
      primaryOperatorEmail: String(formData.get("primaryOperatorEmail") ?? "").trim(),
      brandTone,
      depositPolicy,
    },
    actor.id,
  );

  redirect("/venues");
}

export async function updateStatusAction(formData: FormData) {
  const actor = await requirePlatformUser();
  const slug = String(formData.get("slug") ?? "");
  const status = String(formData.get("status") ?? "") as
    | "DRAFT"
    | "PILOT"
    | "ACTIVE"
    | "PAUSED"
    | "DEACTIVATED";

  if (status === "DEACTIVATED" && actor.role !== "PLATFORM_OWNER") {
    redirect(`/venues/${slug}?error=forbidden`);
  }

  if (status === "PILOT" || status === "ACTIVE") {
    const onboarding = await getVenueOnboarding(slug);
    if (!onboarding?.readyForPilot) {
      redirect(`/venues/${slug}?error=readiness`);
    }
  }

  await updateVenueState(slug, { status }, actor.id);
  redirect(`/venues/${slug}`);
}

export async function updateVenueProfileAction(formData: FormData) {
  const actor = await requirePlatformUser();
  const slug = String(formData.get("slug") ?? "");
  const currentStatus = String(formData.get("currentStatus") ?? "") as
    | "DRAFT"
    | "PILOT"
    | "ACTIVE"
    | "PAUSED"
    | "DEACTIVATED";
  const targetStatus = String(formData.get("targetStatus") ?? "") as
    | "DRAFT"
    | "PILOT"
    | "ACTIVE"
    | "PAUSED"
    | "DEACTIVATED";
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const channelsSummary = buildChannelsSummary(formData);
  const hoursSummary = buildHoursSummary(formData);
  const primaryOperatorName = String(formData.get("primaryOperatorName") ?? "").trim();
  const primaryOperatorRole = String(formData.get("primaryOperatorRole") ?? "").trim();
  const primaryOperatorEmail = String(formData.get("primaryOperatorEmail") ?? "").trim();
  const brandTone = String(formData.get("brandTone") ?? "").trim();
  const depositPolicy = String(formData.get("depositPolicy") ?? "").trim();

  if (
    !slug ||
    !addressLine1 ||
    !city ||
    !state ||
    !postalCode ||
    !phoneNumber ||
    !timezone ||
    !channelsSummary ||
    !brandTone ||
    !depositPolicy
  ) {
    redirect(`/venues/${slug}?error=missing-fields`);
  }

  if (targetStatus === "DEACTIVATED" && actor.role !== "PLATFORM_OWNER") {
    redirect(`/venues/${slug}?error=forbidden`);
  }

  if (targetStatus === "PILOT" || targetStatus === "ACTIVE") {
    const onboarding = await getVenueOnboarding(slug);
    if (!onboarding?.readyForPilot) {
      redirect(`/venues/${slug}?error=readiness`);
    }
  }

  await updateVenueProfile(
    slug,
    {
      addressLine1,
      city,
      state,
      postalCode,
      phoneNumber,
      timezone,
      channelsSummary,
      hoursSummary,
      primaryOperatorName,
      primaryOperatorRole,
      primaryOperatorEmail,
      brandTone,
      depositPolicy,
    },
    actor.id,
  );

  if (targetStatus && targetStatus !== currentStatus) {
    await updateVenueState(slug, { status: targetStatus }, actor.id);
  }

  redirect(`/venues/${slug}`);
}

export async function addVenueTableOptionAction(formData: FormData) {
  const actor = await requirePlatformUser();
  const slug = String(formData.get("slug") ?? "");
  const tableOptionId = String(formData.get("tableOptionId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const quantity = Number(formData.get("quantity") ?? 0);
  const minSpendDollars = Number(formData.get("minSpendDollars") ?? 0);
  const depositDollars = Number(formData.get("depositDollars") ?? 0);
  const capacityMin = Number(formData.get("capacityMin") ?? 0);
  const capacityMax = Number(formData.get("capacityMax") ?? 0);
  const description = String(formData.get("description") ?? "").trim();

  if (
    !slug ||
    !name ||
    !quantity ||
    !capacityMin ||
    !minSpendDollars ||
    !depositDollars ||
    !capacityMax ||
    !description
  ) {
    redirect(`/venues/${slug}?error=missing-table-fields`);
  }

  const payload = {
    name,
    quantity,
    minSpendCents: Math.round(minSpendDollars * 100),
    depositAmountCents: Math.round(depositDollars * 100),
    capacityMin: Math.max(1, capacityMin || 1),
    capacityMax,
    description,
  };

  if (tableOptionId) {
    await updateVenueTableOption(tableOptionId, payload, actor.id);
  } else {
    await addVenueTableOption(slug, payload, actor.id);
  }

  redirect(`/venues/${slug}`);
}

export async function deleteVenueTableOptionAction(formData: FormData) {
  const actor = await requirePlatformUser();
  const slug = String(formData.get("slug") ?? "");
  const tableOptionId = String(formData.get("tableOptionId") ?? "").trim();

  if (!slug || !tableOptionId) {
    redirect(`/venues/${slug}?error=missing-table-fields`);
  }

  await deleteVenueTableOption(tableOptionId, actor.id);
  redirect(`/venues/${slug}`);
}
