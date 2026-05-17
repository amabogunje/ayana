import { getPlatformConfig, getResolvedStripeSecretKey } from "@/lib/platform-config";

type DepositCheckoutInput = {
  reservationId: string;
  venueId: string;
  venueName: string;
  tableName: string;
  guestName: string;
  depositAmountCents: number;
  checkoutMode: "MOCK" | "STRIPE_CONNECT";
  stripeConnectAccountId?: string | null;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
};

export type DepositCheckoutResult = {
  url: string;
  sessionId: string;
};

export async function createDepositCheckout(input: DepositCheckoutInput): Promise<DepositCheckoutResult | null> {
  const platformConfig = await getPlatformConfig();
  const stripeSecretKey = getResolvedStripeSecretKey(platformConfig.stripeSecretKey);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");

  if (!appUrl || input.depositAmountCents <= 0) {
    return null;
  }

  if (
    input.checkoutMode === "MOCK" ||
    !stripeSecretKey ||
    !input.stripeConnectAccountId ||
    !input.stripeChargesEnabled
  ) {
    const sessionId = `mock_${input.reservationId}`;
    return {
      url: `${appUrl}/api/public/deposits/${input.reservationId}/mock?session_id=${sessionId}`,
      sessionId,
    };
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${appUrl}/api/public/deposits/${input.reservationId}/success?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${appUrl}/api/public/deposits/${input.reservationId}/cancelled`);
  params.set("metadata[reservationId]", input.reservationId);
  params.set("metadata[guestName]", input.guestName);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(input.depositAmountCents));
  params.set(
    "line_items[0][price_data][product_data][name]",
    `${input.venueName} ${input.tableName} deposit`,
  );
  params.set(
    "line_items[0][price_data][product_data][description]",
    `Deposit to reserve ${input.tableName} for ${input.guestName}.`,
  );
  params.set("payment_intent_data[application_fee_amount]", String(Math.round(input.depositAmountCents * (platformConfig.stripeApplicationFeeBps / 10_000))));
  params.set("payment_intent_data[metadata][reservationId]", input.reservationId);
  params.set("payment_intent_data[metadata][venueId]", input.venueId);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-account": input.stripeConnectAccountId,
    },
    body: params,
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (!payload.url || !payload.id) {
    return null;
  }

  return {
    url: payload.url,
    sessionId: payload.id,
  };
}
