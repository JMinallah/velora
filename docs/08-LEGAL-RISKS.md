# 08 — Legal risk register

What could get Velora (or you personally) sued, fined or shut down once real people use it, and the fix for each item. Compiled 2026-10-15 from the code as it stands and the sources linked below.

> **This is not legal advice.** It's an engineer's map of the risks, so a lawyer's time goes to the right questions. Before launch, have a lawyer in Kenya review it, plus one for each market you target (EU/UK if you accept users there).

**Why the stakes are high:** Velora stores **identity documents** (passports, visas, permits), immigration plans, employment details and sometimes health questions. It sends some of that to an AI provider abroad, and it gives guidance people may act on with real deadlines. That's the profile regulators and claimants look for.

Status key: 🔴 must fix before any real user · 🟠 before public launch · 🟡 before charging money / scaling · ✅ already handled

---

## A. Data protection & privacy

| # | Risk | Status | Fix | Who |
|---|---|---|---|---|
| A1 | **Personal data sent to Gemini's free tier.** Google's Gemini API terms: for *Unpaid Services*, Google uses submitted content to improve its products, *human reviewers may read* inputs and outputs, and "**Do not submit sensitive, confidential, or personal information to the Unpaid Services.**" Velora sends passport scans (document reading) and personal chats. That breaches Google's terms (they can cut access) and exposes users' identity data. | 🔴 | Use the **Paid tier** (enable billing on the AI Studio project; Flash-Lite costs cents per thousand requests) before any real personal data goes in. Until then, demo/test data only. Code guard: refuse document reading and chat in production unless `GEMINI_TIER=paid` is set. | You (billing) · me (guard) |
| A2 | **EU, UK and Swiss users need the paid tier.** Same terms: "You may use only Paid Services when making API Clients available to users in the European Economic Area", Switzerland and the UK. Many relocations target Germany, Portugal and the UK. | 🔴 | Covered by A1 (paid tier for everyone). | You |
| A3 | **No privacy policy, no recorded consent.** Kenya's Data Protection Act 2019 (and GDPR for EU users) require telling people what is collected, why, who receives it (Google, MongoDB, Cloudflare, Resend, GitHub), where it's stored, for how long, and their rights. Identity documents and health questions call for explicit consent. | 🔴 | **Privacy policy** page (draft from me, reviewed by a lawyer). **Consent at first sign-in**: "I'm 18+ and agree to the Terms and Privacy Policy", with the version and time stored. A **separate explicit consent** before the first document is read by AI. | Me (draft + code) · lawyer (review) |
| A4 | **Cross-border transfer (Kenya DPA ss. 48–49).** Data goes to MongoDB Atlas, Cloudflare R2 and Google outside Kenya. Commentary on s. 49 reads it as needing **the data subject's consent *and* appropriate safeguards**. Kenyan courts have found transfers abroad unlawful under s. 48. ODPC cross-border guidance (2026) treats cloud storage abroad as a transfer. | 🔴 | Name each country/provider in the privacy policy; capture consent (A3); accept each provider's **Data Processing Agreement** (Google Cloud, MongoDB, Cloudflare, Resend; usually click-through); keep a short record of the safeguards. | Me (policy text) · you (accept DPAs) · lawyer |
| A5 | **ODPC registration.** Registration is mandatory above **KSh 5 million annual turnover *and* more than 10 employees** (plus Third-Schedule activities regardless of size). A small pre-revenue team is probably exempt, but **the Act's obligations apply regardless**. | 🟡 | Ask the lawyer whether Velora's processing (identity documents) falls under the Third Schedule; register when thresholds or the schedule apply. | You · lawyer |
| A6 | **Breach response.** Both Kenya's DPA and GDPR require notifying the regulator within **72 hours** of a breach (and users when risk is high). There's no plan today. | 🟠 | A one-page incident runbook: detect (ops page, logs), contain (rotate keys, revoke sessions), assess, notify within 72 h, record. I'll write it. | Me |
| A7 | **Deleted data lingers in backups** for up to 14 days. | 🟠 | Disclose it in the privacy policy (backups are encrypted and expire after 14 days). | Me |
| A8 | **Other people's data in uploads** (a spouse's passport, an employer's letter). | 🟠 | Terms: the user confirms they're entitled to upload what they upload. | Me (terms draft) |
| A9 | **GDPR representative.** If you actively target EU users with no EU presence, GDPR Art. 27 requires an EU representative (paid services exist). | 🟡 | Decide launch markets. If EU users are in scope, get a representative and a GDPR review. | You · lawyer |
| A10 | Deletion, export, minimal logs, encryption | ✅ | Account deletion with files (verified), JSON export, logs without content, encrypted DB/R2/backups, signed links ≤ 15 min, retention pruning. | — |

## B. AI output, advice and reliance

| # | Risk | Status | Fix | Who |
|---|---|---|---|---|
| B1 | **"The app told me the wrong visa date and I missed it."** Users act on AI plans, extracted dates and reminders. | 🟠 | **Terms**: Velora is a coordination tool, not professional advice; information may be wrong; verify with official sources; limitation of liability. **AI notice at point of use** (FR-TRS-3): under the chat box, on drafted plans, on extracted details. Already done: unverified labels, proposals before changes, refusal evals (9/9), "verify with official sources" prompt rule. | Me |
| B2 | **Regulated immigration advice.** In the UK, giving immigration advice *relating to a particular individual* without OISC registration is a criminal offence (Immigration and Asylum Act 1999 ss. 84, 91). Canada and Australia have similar regimes. An AI telling a specific person "you qualify for visa X" sits close to that line. | 🟠 | Prompt rule: Velora gives **general information** and logistics, **never an individual eligibility verdict** ("you qualify / you'll be approved"); for eligibility it points to the official source or a licensed adviser. New refusal fixture to hold it. Marketing must never say "immigration advice". | Me (prompt + eval) · you (marketing) · lawyer (confirm wording) |
| B3 | Medical, legal, financial questions | ✅ | Prompt rule 5 + refusal evals (visa, legal, medical, tax-evasion, fake documents) all pass. Google's terms also say not to rely on the API for such advice, which matches. | — |
| B4 | **Reminders that don't arrive** (scheduler down, email bounced). | 🟠 | Terms + settings note: reminders are best-effort, so keep your own deadlines too. Ops page already flags reminders over 30 minutes late. | Me |
| B5 | **Agent changes users' data by mistake.** | ✅ | Receipts, undo, confirmation cards for deletions, `confirm-writes` mode, audit log, injection evals. | — |

## C. Platform terms & age

| # | Risk | Status | Fix | Who |
|---|---|---|---|---|
| C1 | **Age.** Gemini terms: users of the API must be **18+**, and API clients must not be directed at or likely to be accessed by under-18s. Velora has no age statement. | 🔴 | Terms: 18+ only; the age confirmation is part of the first-sign-in consent (A3). | Me |
| C2 | **Hosting terms.** Vercel Hobby is for non-commercial use only. | 🟡 | Paid plan or another host before charging (already recorded as D1). | You |
| C3 | **Google sign-in.** Production OAuth needs a privacy policy URL, homepage and app branding on the consent screen. | 🟠 | Public `/privacy` and `/terms` pages (A3), then fill in the OAuth consent screen. | Me (pages) · you (console) |

## D. Name, IP and business structure

| # | Risk | Status | Fix | Who |
|---|---|---|---|---|
| D1 | **The name "Velora" is in use.** Found: a UK trade mark application by *Velora Intelligence Ltd* covering messaging and mobile-app services; a pending US "VELORA" mark (VELORA LLC); other businesses and an app developer using the name. A conflict can mean a cease-and-desist and a forced rename after you've built a brand. | 🟠 | Proper search (Kenya KIPI, UK IPO, USPTO, EUIPO, WIPO) **before** any branding spend; file your own mark or rename. | You (or a trademark agent) |
| D2 | **Personal liability.** Operating as an individual means a claim can reach your personal assets. | 🟡 | Form a limited company before launch or charging; consider professional-indemnity and cyber insurance. | You · lawyer/accountant |
| D3 | **Public repo, no licence.** Not a lawsuit risk to you, but it's unclear what others may do with the code; business details are visible. | 🟡 | Make the repo private before launch (as planned), or add a licence on purpose. | You |
| D4 | **Charging later** brings consumer-protection rules (refunds, clear pricing; the EU 14-day withdrawal right). | 🟡 | Address when pricing is decided. | You · lawyer |

## E. Security

| # | Risk | Status | Fix | Who |
|---|---|---|---|---|
| E1 | **No way for researchers to report a vulnerability.** | 🟠 | `/.well-known/security.txt` with a contact address. Needs an email you'll monitor. | Me (file) · you (address) |
| E2 | Error tracking deferred (Sentry). | 🟡 | Set up at deploy (recorded in the delivery plan). | You |
| E3 | Auth, rate limits, signed URLs, secret scanning, dependency audits, encrypted backups | ✅ | In place and tested. | — |

---

## Fixed in code (PR #37, with 7-8)

1. ✅ Public **/privacy** and **/terms** pages: drafts marked for legal review, linked from sign-in and the sidebar. Bracketed details live in `src/lib/legal.ts`.
2. ✅ **First-visit consent screen**: 18+, terms and privacy accepted, stored with version and time; asked again when `LEGAL_VERSION` changes (A3, C1).
3. ✅ **Explicit, revocable consent before AI reads documents**, checked by the server too (the extract route answers 403 without it). Opt-in on the upload area and in Settings (A3, A4).
4. ✅ **AI notice** under the chat box: Velora is an AI and can be wrong; check visa, legal, medical and money details with official sources (B1).
5. ✅ **Prompt v4: no individual eligibility verdicts**, plus a refusal fixture; refusal set 10/10 on Gemini (B2).
6. ✅ **Best-effort reminders** note in Settings and the terms (B4).
7. ✅ **Production guard**: AI runs only with `GEMINI_TIER=paid`; otherwise it's switched off with the banner, and `/ops` says why (A1, A2).
8. ✅ **Incident-response runbook**: [09-INCIDENT-RESPONSE.md](09-INCIDENT-RESPONSE.md) (A6).
9. ⏳ `security.txt`: waiting for a contact email (E1).

## What only you can do

1. **Turn on billing for the Gemini project (paid tier)** before any real user's data goes in (A1/A2).
2. Have a **lawyer review** the privacy policy and terms (Kenya; the EU/UK if targeted), including A4/A5.
3. **Trademark search** for "Velora" (D1) before spending on branding.
4. **Accept the DPAs** of Google Cloud, MongoDB Atlas, Cloudflare and Resend (A4).
5. Decide **launch markets**, **company formation** and **insurance** (A9, D2).
6. Give me a **security contact email** (E1).

### Sources
- [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms): Unpaid Services data use and human review, "do not submit … personal information", Paid Services only for EEA/Switzerland/UK users, 18+.
- [Kenya Data Protection Act, 2019 (ODPC)](https://www.odpc.go.ke/wp-content/uploads/2024/02/TheDataProtectionAct__No24of2019.pdf): Part VI, ss. 48–50.
- [ODPC Guidance Note on Registration of Data Controllers and Processors](https://www.odpc.go.ke/wp-content/uploads/2024/02/ODPC-Guidance-Note-on-Registration-of-Data-Controllers-and-Data-Processors.pdf); [Bowmans on the 2021 regulations](https://www.bowmanslaw.com/insights/data-protection/kenya-snapshot-analysis-of-the-data-protection-regulations-the-next-stage-in-data-protection-compliance-in-kenya/).
- [CMS: transfer of personal data outside Kenya](https://cms.law/en/ken/news-information/transfer-of-personal-data-outside-kenya); [Kenya ODPC 2026 cross-border transfer guidance (commentary)](https://captaincompliance.com/education/kenyas-odpc-issues-2026-cross-border-transfer-guidance-complete-with-its-own-standard-clauses/).
- [Immigration and Asylum Act 1999, explanatory notes on Part V](https://www.legislation.gov.uk/ukpga/1999/33/notes/division/5/8); [OISC conviction press release](https://www.gov.uk/government/news/former-immigration-adviser-convicted-after-oisc-investigation).
- Trade marks: [UK Trade Mark Journal: Velora Intelligence Ltd](https://www.ipo.gov.uk/t-tmj/tm-journals/2026-007/UK00004331648.html); [VELORA LLC portfolio](https://gleanmark.com/owner/velorallc).
