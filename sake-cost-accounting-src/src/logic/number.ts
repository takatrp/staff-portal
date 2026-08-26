export const MONEY_TOLERANCE = 0;
export const QUANTITY_TOLERANCE = 0.001;

export function numeric(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value + Number.EPSILON);
}

export function roundQuantity(value: number, precision = 3): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function isMoneyEqual(a: number, b: number): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= MONEY_TOLERANCE;
}

export function isQuantityEqual(a: number, b: number): boolean {
  return Math.abs(roundQuantity(a) - roundQuantity(b)) <= QUANTITY_TOLERANCE;
}

export function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += numeric(value);
  return total;
}

export function formatMoney(value: number): string {
  return `¥${roundMoney(value).toLocaleString("ja-JP")}`;
}

export function formatQuantity(value: number): string {
  return roundQuantity(value).toLocaleString("ja-JP", { maximumFractionDigits: 3 });
}

export function normalizeNumericText(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/．/g, ".")
    .replace(/－/g, "-")
    .replace(/[，,\s]/g, "");
}

export function parseNumericText(value: string): number | null | "invalid" {
  const normalized = normalizeNumericText(value);
  if (normalized === "") return null;
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return "invalid";
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : "invalid";
}
