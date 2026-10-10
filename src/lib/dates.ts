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
