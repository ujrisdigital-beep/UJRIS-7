/**
 * Injectable clock. Relative dates and urgency day-counts must not call
 * Date.now() from several uncoordinated layers.
 *
 * Civil “today / tomorrow” is Europe/London.
 */

let frozenNow: Date | null = null;

export const REFERENCE_TIME_ZONE = "Europe/London";

export function now(): Date {
  return frozenNow ? new Date(frozenNow.getTime()) : new Date();
}

export function freezeTime(value: Date | string): void {
  frozenNow = typeof value === "string" ? new Date(value) : new Date(value.getTime());
}

export function unfreezeTime(): void {
  frozenNow = null;
}

export function londonCivilParts(instant: Date = now()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: REFERENCE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { year, month, day };
}

/** Midnight UTC of the Europe/London civil day of `instant`. */
export function londonCivilUtcDate(instant: Date = now()): Date {
  const { year, month, day } = londonCivilParts(instant);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addLondonCivilDays(instant: Date, days: number): Date {
  const { year, month, day } = londonCivilParts(instant);
  return new Date(Date.UTC(year, month - 1, day + days));
}
