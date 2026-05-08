export function formatMoney(value: number | null | undefined): string {
  const n = value ?? 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function daysHeld(acquiredDate: string | null | undefined): number | null {
  if (!acquiredDate) return null;
  const parsed = new Date(`${acquiredDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

export function daysBetween(
  startIsoDate: string | null | undefined,
  end: Date
): number | null {
  if (!startIsoDate) return null;
  const start = new Date(`${startIsoDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

export function sanitizeMoneyInput(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  if (rest.length === 0) return head;
  return `${head}.${rest.join('').slice(0, 2)}`;
}

export function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateForDisplay(d: Date): string {
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
