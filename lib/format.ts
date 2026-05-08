export function formatMoney(value: number | null | undefined): string {
  const n = value ?? 0;
  return `$${n.toFixed(2)}`;
}

export function daysHeld(acquiredDate: string | null | undefined): number | null {
  if (!acquiredDate) return null;
  const parsed = new Date(`${acquiredDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}
