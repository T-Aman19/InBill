// Helpers to turn a local calendar-date (YYYY-MM-DD) into UTC instants for the
// configured business timezone. Reports/exports store `createdAt` in UTC, so a
// naive `new Date(to + "T23:59:59Z")` boundary is wrong by the outlet's offset
// (e.g. 5.5h for Asia/Kolkata), silently mis-counting rows near midnight.
import { config } from "../config.js"

/** ms to add to a UTC instant to reach the same wall-clock time in `timeZone`. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
  const map: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value
  const asUTC = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    Number(map.hour), Number(map.minute), Number(map.second),
  )
  return asUTC - date.getTime()
}

/** UTC instant for `dateStr` (YYYY-MM-DD) at 00:00:00 business-local. */
export function dayStart(dateStr: string): Date {
  const guess = new Date(dateStr + "T00:00:00Z")
  return new Date(guess.getTime() - tzOffsetMs(guess, config.timezone))
}

/** UTC instant for `dateStr` (YYYY-MM-DD) at 23:59:59.999 business-local. */
export function dayEnd(dateStr: string): Date {
  const guess = new Date(dateStr + "T23:59:59.999Z")
  return new Date(guess.getTime() - tzOffsetMs(guess, config.timezone))
}

/** Hour-of-day (0–23) of a UTC instant in the business timezone. */
export function localHour(date: Date): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, hour: "2-digit", hourCycle: "h23" }).format(date)
  return Number(h) % 24
}

/** Business-local calendar date (YYYY-MM-DD) of a UTC instant. */
export function localDateStr(date: Date): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

/** Weekday (0 = Sunday … 6 = Saturday) and "HH:MM" of a UTC instant in the business timezone. */
export function localDayAndTime(date: Date): { day: number; time: string } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone, hourCycle: "h23",
    weekday: "short", hour: "2-digit", minute: "2-digit",
  })
  const map: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return { day: days.indexOf(map.weekday ?? "Sun"), time: `${map.hour}:${map.minute}` }
}
