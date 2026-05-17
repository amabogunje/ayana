import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  const { reservationId } = await params;
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? `mock_${reservationId}`;
  const successUrl = `/api/public/deposits/${reservationId}/success?session_id=${encodeURIComponent(sessionId)}`;
  const cancelledUrl = `/api/public/deposits/${reservationId}/cancelled`;

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      inquiry: true,
      tableOption: true,
    },
  });

  if (!reservation) {
    return new Response(
      `<!doctype html><html><head><title>Deposit unavailable</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="font-family: system-ui, sans-serif; padding: 32px;"><h1>Deposit unavailable</h1><p>We couldn't find that reservation.</p></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 404 },
    );
  }

  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(reservation.depositAmountCents / 100);

  return new Response(
    `<!doctype html><html><head><title>Mock deposit checkout</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="font-family: system-ui, sans-serif; padding: 32px; background: #0f172a; color: #e2e8f0;"><div style="max-width: 560px; margin: 0 auto; background: #111827; border: 1px solid #334155; border-radius: 18px; padding: 24px;"><p style="letter-spacing: .12em; text-transform: uppercase; font-size: 12px; color: #94a3b8;">Mock checkout</p><h1 style="margin: 8px 0 12px;">${reservation.inquiry.guestName}, hold ${reservation.tableOption.name}</h1><p style="color: #cbd5e1;">This is a mock deposit page so we can complete the booking flow before a real Stripe Connect account is attached.</p><div style="margin: 20px 0; padding: 16px; border-radius: 14px; background: #0b1220; border: 1px solid #1e293b;"><div style="display:flex; justify-content:space-between; gap: 12px;"><span>Deposit</span><strong>${amount}</strong></div><div style="display:flex; justify-content:space-between; gap: 12px; margin-top: 10px;"><span>Reservation</span><strong>${reservation.arrivalTimeLabel}</strong></div></div><div style="display:flex; gap: 12px; flex-wrap: wrap;"><a href="${successUrl}" style="display:inline-block; background:#f59e0b; color:#111827; text-decoration:none; padding:12px 18px; border-radius:999px; font-weight:600;">Mock pay deposit</a><a href="${cancelledUrl}" style="display:inline-block; background:transparent; color:#e2e8f0; text-decoration:none; padding:12px 18px; border-radius:999px; border:1px solid #475569;">Cancel</a></div></div></body></html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}
