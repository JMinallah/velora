const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Formats a stored date for display, e.g. "Dec 1, 2026". Date-only values
 * (YYYY-MM-DD) are formatted in UTC so they never show as the previous day
 * in timezones west of UTC. Returns null for empty or unparseable input.
 */
export function formatDisplayDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(DATE_ONLY.test(value) ? `${value}T00:00:00Z` : value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, {
    dateStyle: "medium",
    ...(DATE_ONLY.test(value) ? { timeZone: "UTC" } : {}),
  })
}

/** Value for an `<input type="date">` from a stored date (YYYY-MM-DD or ISO datetime). */
export function toDateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ""
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * When to remind about renewing: 6 months before expiry; if that has
 * passed, 30 days before; if that has passed too, tomorrow — as long as the
 * document hasn't expired by then. Null otherwise.
 */
export function renewalReminderDate(expiry: string, now = Date.now()): string | null {
  const expiresAt = Date.parse(`${expiry.slice(0, 10)}T09:00:00Z`)
  if (Number.isNaN(expiresAt)) return null
  const sixMonthsBefore = new Date(expiresAt)
  sixMonthsBefore.setUTCMonth(sixMonthsBefore.getUTCMonth() - 6)
  const options = [sixMonthsBefore.getTime(), expiresAt - 30 * DAY_MS, now + DAY_MS]
  const when = options.find((t) => t > now && t < expiresAt)
  return when === undefined ? null : new Date(when).toISOString()
}

/** True when the runtime knows the IANA time zone (e.g. "Africa/Nairobi"). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

/** How far the zone's wall clock is ahead of UTC at `instant`, in ms. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return wall - Math.floor(instant / 1000) * 1000
}

/**
 * The UTC instant at which it is `hour`:00 on `date` (YYYY-MM-DD) in
 * `timeZone`, `daysBefore` days earlier. Daylight-saving safe: the offset is
 * re-read at the result, so 09:00 stays 09:00 across a clock change.
 */
export function localTimeToUtc(date: string, hour: number, timeZone: string, daysBefore = 0): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return null
  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - daysBefore, hour)
  if (Number.isNaN(wall)) return null
  const first = wall - zoneOffsetMs(wall, timeZone)
  return new Date(wall - zoneOffsetMs(first, timeZone))
}
