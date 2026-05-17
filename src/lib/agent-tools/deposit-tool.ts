import { createDepositCheckout } from "@/lib/deposit-checkout";

export type CreateDepositCheckoutForAgentInput = {
  reservationId: string;
  venueId: string;
  venueName: string;
  tableName: string;
  guestName: string;
  depositAmountCents: number;
  checkoutMode: "MOCK" | "STRIPE_CONNECT";
  stripeConnectAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
};

export async function createDepositCheckoutForAgent(input: CreateDepositCheckoutForAgentInput) {
  return createDepositCheckout(input);
}
