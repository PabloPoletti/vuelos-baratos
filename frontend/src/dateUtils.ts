/**
 * When the user changes a trip start date, align the end/return date to the
 * same year-month — keeping the day when possible, but never before start+1.
 */

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function syncEndDateToStartMonth(
  startIso: string,
  endIso: string,
): string {
  if (!startIso) return endIso;

  const parts = startIso.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const startDay = parts[2];
  if (!y || !m || !startDay) return endIso;

  const maxDay = daysInMonth(y, m);

  if (!endIso) {
    const endDay = Math.min(startDay + 14, maxDay);
    return fmt(y, m, Math.max(endDay, startDay + 1));
  }

  const endParts = endIso.split("-").map(Number);
  let endDay = endParts[2] ?? startDay + 14;

  endDay = Math.min(endDay, maxDay);
  if (endDay <= startDay) {
    endDay = Math.min(startDay + 14, maxDay);
    if (endDay <= startDay) endDay = maxDay;
  }

  return fmt(y, m, endDay);
}
