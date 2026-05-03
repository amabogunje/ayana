import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  const { reservationId } = await params;
  const sessionId = request.nextUrl.searchParams.get("session_id");

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      inquiry: true,
      tableOption: true,
    },
  });

  if (reservation) {
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: "CONFIRMED",
        depositPaidCents: reservation.depositAmountCents,
        depositCheckoutSessionId: sessionId ?? reservation.depositCheckoutSessionId,
      },
    });

    await prisma.inquiry.update({
      where: { id: reservation.inquiryId },
      data: {
        status: "CONFIRMED",
        nextAction: "Deposit paid. Reservation confirmed; send final host confirmation.",
      },
    });
  }

  return new Response(
    `<!doctype html><html><head><title>Deposit paid</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="font-family: system-ui, sans-serif; padding: 32px;"><h1>Deposit received</h1><p>Your table reservation is confirmed. You can close this window and return to chat.</p></body></html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}
