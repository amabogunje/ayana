export function formatCurrencyFromCents(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

export function formatCurrencyRange(minCents: number, maxCents?: number | null): string {
  if (!maxCents || maxCents === minCents) {
    return `${formatCurrencyFromCents(minCents)}+`;
  }

  return `${formatCurrencyFromCents(minCents)}-${formatCurrencyFromCents(maxCents)}`;
}
