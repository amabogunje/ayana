"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { requireOperatorUser } from "@/lib/operator-auth";
import {
  addOperatorMessage,
  assignOperatorInquiry,
  createOperatorEventOverride,
  createOperatorEventSeries,
  createOperatorQuote,
  createOperatorReservation,
  createOperatorStaffReservation,
  generateOperatorWebsiteChatSnippet,
  uploadOperatorVenueAsset,
  updateOperatorEventOverride,
  updateOperatorEventSeries,
  updateOperatorInquiryStatus,
  updateOperatorReservation,
  updateOperatorVenueSettings,
} from "@/lib/operator-service";
import { hasUploadedFile } from "@/lib/venue-assets";

function messageParam(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return encodeURIComponent(message);
}

function rethrowIfRedirectError(error: unknown) {
  if (isRedirectError(error)) {
    throw error;
  }
}

function formatDateInputLabel(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatTimeInputLabel(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return value;
  const [hoursValue, minutes] = value.split(":").map(Number);
  const period = hoursValue >= 12 ? "PM" : "AM";
  const hours = hoursValue % 12 || 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${period}`;
}

export async function updateOperatorInquiryStatusAction(formData: FormData) {
  const user = await requireOperatorUser();
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const successRedirect = redirectTo.startsWith("/operator/inbox")
    ? redirectTo
    : `/operator/inbox/${inquiryId}`;
  const status = String(formData.get("status") ?? "").trim() as
    | "NEW"
    | "QUALIFYING"
    | "QUOTED"
    | "DEPOSIT_SENT"
    | "CONFIRMED"
    | "NEEDS_HUMAN"
    | "LOST";

  if (!inquiryId || !status) {
    redirect("/operator/inbox");
  }

  try {
    await updateOperatorInquiryStatus(user.venueId, inquiryId, status, user.id);
    redirect(`${successRedirect}${successRedirect.includes("?") ? "&" : "?"}saved=status`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/inbox/${inquiryId}?error=${messageParam(error)}`);
  }
}

export async function updateOperatorVenueSettingsAction(formData: FormData) {
  const user = await requireOperatorUser();

  try {
    await updateOperatorVenueSettings(
      user.venueId,
      {
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
      },
      user.id,
    );

    const bottleMenuFile = formData.get("bottleMenuFile");
    if (hasUploadedFile(bottleMenuFile)) {
      await uploadOperatorVenueAsset(
        user.venueId,
        {
          type: "BOTTLE_MENU",
          label: "Bottle menu",
          file: bottleMenuFile,
        },
        user.id,
      );
    }

    const foodMenuFile = formData.get("foodMenuFile");
    if (hasUploadedFile(foodMenuFile)) {
      await uploadOperatorVenueAsset(
        user.venueId,
        {
          type: "FOOD_MENU",
          label: "Food menu",
          file: foodMenuFile,
        },
        user.id,
      );
    }

    const hookahMenuFile = formData.get("hookahMenuFile");
    if (hasUploadedFile(hookahMenuFile)) {
      await uploadOperatorVenueAsset(
        user.venueId,
        {
          type: "HOOKAH_MENU",
          label: "Hookah menu",
          file: hookahMenuFile,
        },
        user.id,
      );
    }

    redirect("/operator/settings?saved=1");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/settings?error=${messageParam(error)}`);
  }
}

export async function createOperatorEventSeriesAction(formData: FormData) {
  const user = await requireOperatorUser();

  try {
    const flyerFile = formData.get("flyerFile");
    await createOperatorEventSeries(
      user.venueId,
      {
        title: String(formData.get("title") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim(),
        recurringDays: formData.getAll("recurringDays").map((value) => String(value)),
        startDate: String(formData.get("startDate") ?? "").trim() || undefined,
        endDate: String(formData.get("endDate") ?? "").trim() || undefined,
        flyerFile: hasUploadedFile(flyerFile) ? flyerFile : null,
      },
      user.id,
    );

    redirect("/operator/events?saved=series");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/events?error=${messageParam(error)}`);
  }
}

export async function createOperatorEventOverrideAction(formData: FormData) {
  const user = await requireOperatorUser();

  try {
    const flyerFile = formData.get("flyerFile");
    await createOperatorEventOverride(
      user.venueId,
      {
        eventSeriesId: String(formData.get("eventSeriesId") ?? "").trim() || null,
        occurrenceDate: String(formData.get("occurrenceDate") ?? "").trim(),
        title: String(formData.get("title") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim(),
        isCancelled: formData.get("isCancelled") === "on",
        flyerFile: hasUploadedFile(flyerFile) ? flyerFile : null,
      },
      user.id,
    );

    redirect("/operator/events?saved=override");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/events?error=${messageParam(error)}`);
  }
}

export async function createOperatorEventAction(formData: FormData) {
  const user = await requireOperatorUser();

  try {
    const flyerFile = formData.get("flyerFile");
    const isRecurring = formData.get("isRecurring") === "on";
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const eventDate = String(formData.get("eventDate") ?? "").trim();
    const startDate = String(formData.get("startDate") ?? "").trim();
    const endDate = String(formData.get("endDate") ?? "").trim();

    if (isRecurring) {
      await createOperatorEventSeries(
        user.venueId,
        {
          title,
          description,
          recurringDays: formData.getAll("recurringDays").map((value) => String(value)),
          startDate: startDate || eventDate || undefined,
          endDate: endDate || undefined,
          flyerFile: hasUploadedFile(flyerFile) ? flyerFile : null,
        },
        user.id,
      );

      redirect("/operator/events?saved=series");
    }

    await createOperatorEventOverride(
      user.venueId,
      {
        eventSeriesId: null,
        occurrenceDate: eventDate,
        title,
        description,
        isCancelled: false,
        flyerFile: hasUploadedFile(flyerFile) ? flyerFile : null,
      },
      user.id,
    );

    redirect("/operator/events?saved=override");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/events?error=${messageParam(error)}`);
  }
}

export async function updateOperatorEventAction(formData: FormData) {
  const user = await requireOperatorUser();
  const eventType = String(formData.get("eventType") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const month = String(formData.get("month") ?? "").trim();
  const monthParam = /^\d{4}-\d{2}$/.test(month) ? `&month=${month}` : "";
  const selectedParam = eventType && eventId ? `&event=${eventType}:${eventId}` : "";

  if (!eventType || !eventId) {
    redirect(`/operator/events?error=Missing%20event%20selection.${monthParam}`);
  }

  try {
    const flyerFile = formData.get("flyerFile");
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const active = formData.getAll("active").includes("on");

    if (eventType === "series") {
      await updateOperatorEventSeries(
        user.venueId,
        eventId,
        {
          title,
          description,
          recurringDays: formData.getAll("recurringDays").map((value) => String(value)),
          startDate: String(formData.get("startDate") ?? "").trim() || undefined,
          endDate: String(formData.get("endDate") ?? "").trim() || undefined,
          active,
          flyerFile: hasUploadedFile(flyerFile) ? flyerFile : null,
        },
        user.id,
      );

      redirect(`/operator/events?saved=series${monthParam}`);
    }

    await updateOperatorEventOverride(
      user.venueId,
      eventId,
      {
        occurrenceDate: String(formData.get("occurrenceDate") ?? "").trim(),
        title,
        description,
        isCancelled: formData.get("isCancelled") === "on",
        active,
        flyerFile: hasUploadedFile(flyerFile) ? flyerFile : null,
      },
      user.id,
    );

    redirect(`/operator/events?saved=override${monthParam}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/events?drawer=detail${selectedParam}${monthParam}&error=${messageParam(error)}`);
  }
}

export async function generateOperatorWebsiteChatSnippetAction() {
  const user = await requireOperatorUser();

  try {
    await generateOperatorWebsiteChatSnippet(user.venueId, user.id);
    redirect("/operator/settings?saved=website-chat&tab=channels");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/settings?error=${messageParam(error)}&tab=channels`);
  }
}

export async function createOperatorQuoteAction(formData: FormData) {
  const user = await requireOperatorUser();
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  const tableOptionId = String(formData.get("tableOptionId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const pitch = String(formData.get("pitch") ?? "").trim();
  const markSent = String(formData.get("markSent") ?? "") === "1";

  if (!inquiryId || !tableOptionId || !label || !pitch) {
    redirect(`/operator/inbox/${inquiryId || ""}`);
  }

  try {
    await createOperatorQuote(
      user.venueId,
      inquiryId,
      { tableOptionId, label, pitch, markSent },
      user.id,
    );

    redirect(`/operator/inbox/${inquiryId}?saved=quote`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/inbox/${inquiryId}?error=${messageParam(error)}`);
  }
}

export async function createOperatorReservationAction(formData: FormData) {
  const user = await requireOperatorUser();
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  const tableOptionId = String(formData.get("tableOptionId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as
    | "PENDING"
    | "DEPOSIT_PENDING"
    | "CONFIRMED"
    | "CANCELLED";
  const depositPaidDollars = Number.parseFloat(String(formData.get("depositPaidDollars") ?? "0"));
  const notes = String(formData.get("notes") ?? "").trim();
  const arrivalTimeLabel = String(formData.get("arrivalTimeLabel") ?? "").trim();

  if (!inquiryId || !tableOptionId || !status) {
    redirect(`/operator/inbox/${inquiryId || ""}`);
  }

  try {
    await createOperatorReservation(
      user.venueId,
      inquiryId,
      {
        tableOptionId,
        status,
        depositPaidDollars: Number.isFinite(depositPaidDollars) ? depositPaidDollars : 0,
        notes,
        arrivalTimeLabel,
      },
      user.id,
    );

    redirect(`/operator/inbox/${inquiryId}?saved=reservation`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/inbox/${inquiryId}?error=${messageParam(error)}`);
  }
}

export async function createOperatorStaffReservationAction(formData: FormData) {
  const user = await requireOperatorUser();
  const guestName = String(formData.get("guestName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const requestedDate = String(formData.get("requestedDate") ?? "").trim();
  const requestedDateLabel =
    formatDateInputLabel(requestedDate) || String(formData.get("requestedDateLabel") ?? "").trim();
  const arrivalTime = String(formData.get("arrivalTime") ?? "").trim();
  const arrivalTimeLabel =
    formatTimeInputLabel(arrivalTime) || String(formData.get("arrivalTimeLabel") ?? "").trim();
  const tableOptionId = String(formData.get("tableOptionId") ?? "").trim();
  const partySize = Number.parseInt(String(formData.get("partySize") ?? "0"), 10);
  const depositPaidValue = String(formData.get("depositPaidDollars") ?? "").trim();
  const depositPaidDollars = depositPaidValue ? Number.parseFloat(depositPaidValue) : undefined;
  const notes = String(formData.get("notes") ?? "").trim();
  const returnDate = String(formData.get("returnDate") ?? "").trim();
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : /^\d{4}-\d{2}-\d{2}$/.test(returnDate)
      ? returnDate
      : "";
  const returnDateParam = selectedDate ? `&date=${selectedDate}` : "";

  if (!guestName || !tableOptionId || !arrivalTimeLabel) {
    redirect(`/operator/reservations?drawer=new&error=Missing%20required%20reservation%20fields.${returnDateParam}`);
  }

  try {
    await createOperatorStaffReservation(
      user.venueId,
      {
        guestName,
        phone,
        requestedDateLabel,
        partySize: Number.isFinite(partySize) ? partySize : 0,
        tableOptionId,
        depositPaidDollars,
        notes,
        arrivalTimeLabel,
      },
      user.id,
    );

    redirect(`/operator/reservations?saved=reservation${returnDateParam}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/reservations?drawer=new&error=${messageParam(error)}${returnDateParam}`);
  }
}

export async function updateOperatorReservationAction(formData: FormData) {
  const user = await requireOperatorUser();
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as
    | "PENDING"
    | "DEPOSIT_PENDING"
    | "CONFIRMED"
    | "CANCELLED";
  const depositPaidDollars = Number.parseFloat(String(formData.get("depositPaidDollars") ?? "0"));
  const notes = String(formData.get("notes") ?? "").trim();

  if (!inquiryId || !status) {
    redirect(`/operator/inbox/${inquiryId || ""}`);
  }

  try {
    await updateOperatorReservation(
      user.venueId,
      inquiryId,
      {
        status,
        depositPaidDollars: Number.isFinite(depositPaidDollars) ? depositPaidDollars : 0,
        notes,
      },
      user.id,
    );

    redirect(`/operator/inbox/${inquiryId}?saved=reservation`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/inbox/${inquiryId}?error=${messageParam(error)}`);
  }
}

export async function assignOperatorInquiryAction(formData: FormData) {
  const user = await requireOperatorUser();
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  const assignedVenueUserIdValue = String(formData.get("assignedVenueUserId") ?? "").trim();
  const assignedVenueUserId = assignedVenueUserIdValue || null;

  if (!inquiryId) {
    redirect("/operator/inbox");
  }

  try {
    await assignOperatorInquiry(user.venueId, inquiryId, assignedVenueUserId, user.id);
    redirect(`/operator/inbox/${inquiryId}?saved=assignment`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/inbox/${inquiryId}?error=${messageParam(error)}`);
  }
}

export async function addOperatorMessageAction(formData: FormData) {
  const user = await requireOperatorUser();
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const successRedirect = redirectTo.startsWith("/operator/inbox")
    ? redirectTo
    : `/operator/inbox/${inquiryId}`;

  if (!inquiryId || !content) {
    redirect(successRedirect);
  }

  try {
    await addOperatorMessage(user.venueId, inquiryId, content, user.id);
    redirect(`${successRedirect}${successRedirect.includes("?") ? "&" : "?"}saved=message`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`/operator/inbox/${inquiryId}?error=${messageParam(error)}`);
  }
}
