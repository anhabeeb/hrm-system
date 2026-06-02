import { formatMoneyMinor } from "@/lib/format";

export const MoneyAmount = ({ amount, currency = "MVR" }: { amount?: number | null; currency?: string }) => (
  <span className="tabular-nums">{formatMoneyMinor(amount ?? 0, currency)}</span>
);
