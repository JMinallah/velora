# 09 — Incident response (personal-data breach)

For a suspected leak, loss or unauthorised access involving users' data (docs/08-LEGAL-RISKS.md A6). Velora holds identity documents, so treat any doubt as an incident until shown otherwise.

**Clock: regulators must be told within 72 hours of becoming aware** of a breach likely to put people at risk: Kenya's Data Protection Act 2019 s. 43, and GDPR Art. 33 for EU/UK users. Start a written log at once: what you saw, when, what you did.

## 1. Detect (minutes)
Typical signals: `/ops` (error spikes, odd AI usage), host and Atlas alerts, GitHub secret-scanning alerts, a researcher's report (security contact), a user report, unexpected R2/Atlas activity.

## 2. Contain (first hour)
- **Leaked secret:** rotate it at the source and redeploy. Covers the database user (Atlas), the R2 token (Cloudflare), the Gemini key (AI Studio), `AUTH_SECRET`, `CRON_SECRET`, `AUTH_RESEND_KEY`, and `BACKUP_PASSPHRASE` (which also means re-creating backups).
- **Possible account takeover or session theft:** delete affected rows in the `sessions` collection, which signs those users out everywhere. Rotate `AUTH_SECRET`.
- **Exposed files:** signed links expire within minutes. If R2 credentials leaked, rotate them and review the bucket's access logs.
- **Bad code path:** roll back the deployment. Main is always deployable.
- Keep evidence: export logs before they rotate. Don't delete records that show what happened.

## 3. Assess (by hour 24)
Whose data, which data (identity documents? emails?), how many people, and whether it's still exposed. The structured logs (request ids, routes, statuses) and the `events` audit log show what each account did. Decide whether the breach is likely to put people at risk.

## 4. Notify (by hour 72)
- **Regulator:** Kenya's ODPC (odpc.go.ke), plus the lead EU/UK authority if EU/UK residents are affected. Say what happened, the data and people affected, likely consequences, and what you did. If something isn't known yet, notify anyway and follow up.
- **Affected users:** without undue delay when the risk is high. Plain language: what happened, what it means for them, what they should do (e.g. watch for misuse of their passport number), and a contact.
- **Processors:** Google, MongoDB, Cloudflare and Resend, if the incident involves their side.

## 5. Recover and learn
Fix the cause, add a test or check that would have caught it, and write a short post-mortem in this folder with the timeline, cause, impact, fixes and notifications sent. Data restored from backup: see [07-BACKUP-RESTORE.md](07-BACKUP-RESTORE.md).
