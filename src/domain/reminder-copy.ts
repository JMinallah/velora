import type { ReminderRecord } from "./collections"

/**
 * Reminder email copy (FR-REM-3, template-bounded). Every field is filled
 * from stored data into a fixed template — nothing here can add a promise or
 * a date that isn't in the reminder. Titles may come from the agent or from
 * extracted documents, so everything is escaped for HTML and stripped of
 * line breaks in the subject.
 */

export type ReminderEmail = { subject: string; text: string; html: string }

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

const oneLine = (value: string, max: number) => {
  const flat = value.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function formatDay(date: string): string {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

export function renderReminderEmail(input: {
  reminder: Pick<ReminderRecord, "kind" | "title" | "details" | "taskDueDate" | "missionId">
  missionTitle: string
  appUrl?: string
}): ReminderEmail {
  const { reminder, missionTitle } = input
  const title = oneLine(reminder.title, 120)
  const mission = oneLine(missionTitle, 120)
  const due = reminder.kind === "task-due" && reminder.taskDueDate ? formatDay(reminder.taskDueDate) : null

  const subject = due ? `Due ${due}: ${title}` : `Reminder: ${title}`
  const headline = due ? `"${title}" is due ${due}.` : title
  const details = reminder.details?.trim()
  const base = input.appUrl?.replace(/\/+$/, "")
  const missionUrl = base ? `${base}/mission/${encodeURIComponent(reminder.missionId)}` : null
  const settingsUrl = base ? `${base}/settings` : null

  const text = [
    headline,
    details,
    `Mission: ${mission}`,
    missionUrl && `Open it: ${missionUrl}`,
    "",
    `You get this because email reminders are on.${settingsUrl ? ` Change that in Settings: ${settingsUrl}` : " Change that in Velora's Settings."}`,
  ]
    .filter((line) => line !== undefined && line !== null)
    .join("\n")

  const html = [
    `<p style="font-size:16px"><strong>${escapeHtml(headline)}</strong></p>`,
    details && `<p>${escapeHtml(details).replace(/\n/g, "<br>")}</p>`,
    `<p>Mission: ${missionUrl ? `<a href="${escapeHtml(missionUrl)}">${escapeHtml(mission)}</a>` : escapeHtml(mission)}</p>`,
    `<p style="color:#666;font-size:12px">You get this because email reminders are on. ${
      settingsUrl ? `<a href="${escapeHtml(settingsUrl)}">Change that in Settings</a>.` : "Change that in Velora's Settings."
    }</p>`,
  ]
    .filter(Boolean)
    .join("\n")

  return { subject: oneLine(subject, 160), text, html }
}
