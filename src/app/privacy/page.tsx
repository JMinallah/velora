import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_DETAILS, LEGAL_VERSION, MINIMUM_AGE } from "@/lib/legal";
import { DraftNotice, Section } from "@/components/legal";

export const metadata: Metadata = { title: "Privacy Policy — Velora" };

/**
 * Privacy Policy (docs/08-LEGAL-RISKS.md A3/A4/A7). DRAFT for legal review:
 * the bracketed details in src/lib/legal.ts must be filled in before launch,
 * and a lawyer should check it against Kenya's Data Protection Act 2019 and
 * the GDPR if EU/UK users are in scope.
 */
export default function PrivacyPage() {
  const d = LEGAL_DETAILS;
  return (
    <article className="prose-legal mx-auto w-full max-w-3xl space-y-6 pb-16 text-sm leading-6">
      <DraftNotice />
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-muted-foreground">Version {LEGAL_VERSION}</p>
      </header>

      <Section title="Who we are">
        <p>
          Velora is operated by {d.operator}, {d.address} (&ldquo;we&rdquo;). We decide how your personal data is used
          (we are the data controller). Contact: {d.contactEmail}.
        </p>
      </Section>

      <Section title="What we collect">
        <ul>
          <li><strong>Account:</strong> your name and email address from Google sign-in (or the email you sign in with).</li>
          <li><strong>What you put in Velora:</strong> missions, tasks, dates, chat messages, reminders and settings.</li>
          <li><strong>Documents you upload</strong> — which may include identity documents such as passports, visas and permits — and the details read from them (e.g. document numbers and expiry dates).</li>
          <li><strong>Technical data:</strong> a sign-in cookie, your IP address (for abuse protection) and request logs that record what happened (e.g. an error) but never what you wrote.</li>
        </ul>
        <p>Please don&apos;t upload documents about other people unless you&apos;re entitled to share them.</p>
      </Section>

      <Section title="Why we use it, and on what basis">
        <ul>
          <li>To provide Velora — store your missions, remind you, show your documents (to perform our agreement with you).</li>
          <li>To run AI features you use — the chat assistant, plan drafting, and reading documents — only with your consent; reading documents needs a separate opt-in you can withdraw in Settings.</li>
          <li>To keep the service secure and working — rate limits, error logs, backups (our legitimate interests and legal obligations).</li>
        </ul>
        <p>We don&apos;t sell your data, show ads, or use it to train AI models.</p>
      </Section>

      <Section title="AI processing">
        <p>
          AI features send the content they need — your message and mission details, or the document you asked Velora to
          read — to Google&apos;s Gemini API. We use Google&apos;s paid service, under which Google does not use your
          content to improve its models. A document is read in a separate step with no access to your other data, and
          everything read from it stays marked &ldquo;unverified&rdquo; until you confirm it. AI output can be wrong.
        </p>
      </Section>

      <Section title="Who else handles your data">
        <p>These providers process data for us under their data-processing terms:</p>
        <ul>
          <li><strong>MongoDB Atlas</strong> — database (region: [fill in]).</li>
          <li><strong>Cloudflare R2</strong> — document file storage.</li>
          <li><strong>Google</strong> — Gemini AI, and Google sign-in.</li>
          <li><strong>Resend</strong> — reminder emails.</li>
          <li><strong>[Hosting provider]</strong> — runs the app.</li>
          <li><strong>GitHub</strong> — encrypted nightly backups and scheduled jobs.</li>
        </ul>
        <p>
          Some of these store or process data <strong>outside Kenya</strong> (for example in the United States or the
          EU). We transfer data abroad with your consent and with safeguards — the providers&apos; data-processing
          agreements, encryption in storage and in transit, and access limited to what each service needs.
        </p>
      </Section>

      <Section title="How long we keep it">
        <ul>
          <li>Missions, tasks, reminders, documents and settings: until you delete them or your account.</li>
          <li>Chat messages, the activity log and reminder delivery records: 12 months.</li>
          <li>Encrypted backups: 14 days — so deleted data can remain in a backup for up to 14 days before it expires.</li>
        </ul>
      </Section>

      <Section title="Your rights">
        <p>
          You can access and download all your data (Settings → Your data), correct it, delete your account and everything
          in it (Settings → Delete your account), withdraw consent for AI reading of documents (Settings), and object to
          or ask us to restrict processing by contacting {d.contactEmail}. You can also complain to Kenya&apos;s Office
          of the Data Protection Commissioner (odpc.go.ke) or the data protection authority where you live.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Data is encrypted in transit and at rest; documents are private and opened only through links that expire within
          minutes; backups are encrypted. If a breach puts your data at risk, we will tell you and the regulator as the
          law requires.
        </p>
      </Section>

      <Section title="Cookies">
        <p>Velora uses only the cookie that keeps you signed in. No advertising or tracking cookies.</p>
      </Section>

      <Section title="Age">
        <p>Velora is for people aged {MINIMUM_AGE} and over.</p>
      </Section>

      <Section title="Changes">
        <p>
          If we change this policy in a way that matters, we&apos;ll ask you to review it the next time you open Velora.
          See also the <Link href="/terms" className="underline">Terms of Service</Link>.
        </p>
      </Section>
    </article>
  );
}
