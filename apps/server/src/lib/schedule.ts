import { localDayAndTime } from "./dateRange.js"

export type ScheduleWindow = {
  days: unknown // jsonb: number[] (0 = Sunday), empty = every day
  startTime: string // "HH:MM" outlet-local
  endTime: string
  isActive: boolean
}

// A window is active when today matches `days` and the outlet-local time is
// inside [startTime, endTime). Windows may wrap midnight (end < start), e.g.
// happy hour 22:00–01:00 — the day check then applies to the start day.
export function isScheduleActiveNow(s: ScheduleWindow, now = new Date()): boolean {
  if (!s.isActive) return false
  const { day, time } = localDayAndTime(now)
  const days = Array.isArray(s.days) ? (s.days as number[]) : []

  if (s.endTime < s.startTime) {
    // Wraps midnight: active late on the start day, or early on the next day
    const prevDay = (day + 6) % 7
    const inLate  = time >= s.startTime && (days.length === 0 || days.includes(day))
    const inEarly = time < s.endTime && (days.length === 0 || days.includes(prevDay))
    return inLate || inEarly
  }

  if (days.length > 0 && !days.includes(day)) return false
  return time >= s.startTime && time < s.endTime
}
