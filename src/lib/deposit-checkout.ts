import { getPlatformConfig, getResolvedStripeSecretKey } from "@/lib/platform-config";

type DepositCheckoutInput = {
  reservationId: string;
  venueName: string;
  tableName: string;
  guestName: string;
  depositAmountCents: number;
};

export type DepositCheckoutResult = {
  url: string;
  sessionId: string;
};

export async function createDepositCheckout(input: DepositCheckoutInput): Promise<DepositCheckoutResult | null> {
  const platformConfig = await getPlatformConfig();
  const stripeSecretKey = getResolvedStripeSecretKey(platformConfig.stripeSecretKey);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");

  if (!stripeSecretKey || !appUrl || input.depositAmountCents <= 0) {
    return null;
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

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
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
