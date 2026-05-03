import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createInquiry, createTableOption, createVenue, resetDatabase } from "../helpers/db";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("operator service", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects illegal inquiry status transitions", async () => {
    const { updateOperatorInquiryStatus } = await import("@/lib/operator-service");
    const venue = await createVenue();
    const inquiry = await createInquiry(venue.id, { status: "NEW" });

    await expect(updateOperatorInquiryStatus(venue.id, inquiry.id, "CONFIRMED")).rejects.toThrow(
      "Cannot move inquiry from NEW to CONFIRMED.",
    );
  });

  it("creates a quote and moves the inquiry to quoted", async () => {
    const { createOperatorQuote } = await import("@/lib/operator-service");
    const venue = await createVenue();
    const tableOption = await createTableOption(venue.id);
    const inquiry = await createInquiry(venue.id);

    const quote = await createOperatorQuote(venue.id, inquiry.id, {
      tableOptionId: tableOption.id,
      label: "Prime table",
      pitch: "Best fit for the group.",
      markSent: true,
    });

    const updatedInquiry = await prisma.inquiry.findUnique({ where: { id: inquiry.id } });
    expect(quote.sentAt).toBeInstanceOf(Date);
    expect(updatedInquiry?.status).toBe("QUOTED");
    expect(updatedInquiry?.isHumanTakeover).toBe(false);
  });

  it("prevents confirming reservations before full deposit is paid", async () => {
    const { createOperatorReservation } = await import("@/lib/operator-service");
    const venue = await createVenue();
    const tableOption = await createTableOption(venue.id);
    const inquiry = await createInquiry(venue.id, { status: "QUOTED" });

    await expect(
      createOperatorReservation(venue.id, inquiry.id, {
        tableOptionId: tableOption.id,
        status: "CONFIRMED",
        depositPaidDollars: 50,
        notes: "",
        arrivalTimeLabel: "Saturday 11 PM",
      }),
    ).rejects.toThrow("A reservation cannot be confirmed until the full deposit is paid.");
  });

  it("creates deposit-pending reservations and syncs inquiry status", async () => {
    const { createOperatorReservation } = await import("@/lib/operator-service");
    const venue = await createVenue();
    const tableOption = await createTableOption(venue.id);
    const inquiry = await createInquiry(venue.id, { status: "QUOTED" });

    const reservation = await createOperatorReservation(venue.id, inquiry.id, {
      tableOptionId: tableOption.id,
      status: "DEPOSIT_PENDING",
      depositPaidDollars: 0,
      notes: "Window preferred.",
      arrivalTimeLabel: "Saturday 11 PM",
    });

    const updatedInquiry = await prisma.inquiry.findUnique({ where: { id: inquiry.id } });
    expect(reservation.depositAmountCents).toBe(20_000);
    expect(reservation.status).toBe("DEPOSIT_PENDING");
    expect(updatedInquiry?.status).toBe("DEPOSIT_SENT");
  });
});
