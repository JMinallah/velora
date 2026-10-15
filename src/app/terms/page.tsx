import type { Metadata } from "next";
import Link from "next/link";
import { DraftNotice, Section } from "@/components/legal";
import { LEGAL_DETAILS, LEGAL_VERSION, MINIMUM_AGE } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service — Velora" };

/**
 * Terms of Service (docs/08-LEGAL-RISKS.md B1, B2, B4, C1, A8). DRAFT for
 * legal review — in particular the liability and governing-law sections,
 * which depend on the operating entity and the markets served.
 */
export default function TermsPage() {
  const d = LEGAL_DETAILS;
  return (
    <article className="mx-auto w-full max-w-3xl space-y-6 pb-16 text-sm leading-6">
      <DraftNotice />
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-muted-foreground">Version {LEGAL_VERSION}</p>
      </header>

      <Section title="1. Who you're dealing with">
        <p>
          Velora is provided by {d.operator}, {d.address}. Contact: {d.contactEmail}. By using Velora you agree to these
          terms and to the <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </Section>

      <Section title="2. Who can use Velora">
        <p>You must be {MINIMUM_AGE} or older and able to enter into a binding agreement.</p>
      </Section>

      <Section title="3. What Velora is — and isn't">
        <ul>
          <li>Velora is a tool for organising a life transition: plans, tasks, dates, documents and reminders, with an AI assistant.</li>
          <li>
            <strong>It is not legal, immigration, medical, tax or financial advice</strong>, and no professional relationship
            is created. Velora does not assess whether you qualify for a visa or any other status. For those questions,
            use the official source or a qualified, licensed professional.
          </li>
          <li>
            <strong>AI can be wrong.</strong> Plans, answers and details read from documents may be incomplete or
            incorrect. Check anything important — especially dates, fees and requirements — with the official source
            before you rely on it.
          </li>
          <li>
            <strong>Reminders are best-effort.</strong> We work to deliver them on time, but they can be late or fail
            (for example if email delivery fails). Don&apos;t rely on Velora as your only record of a deadline.
          </li>
        </ul>
      </Section>

      <Section title="4. Your content">
        <p>
          You own what you put into Velora. You let us store and process it only to provide the service to you, as the
          Privacy Policy describes. You confirm that you&apos;re entitled to upload what you upload, including any
          documents that concern other people.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>Don&apos;t use Velora to:</p>
        <ul>
          <li>create or alter documents to deceive anyone (e.g. forged bank statements or IDs), or for any other fraud;</li>
          <li>break the law, or infringe others&apos; rights;</li>
          <li>attack, overload or try to get around the security or limits of the service, or access others&apos; data.</li>
        </ul>
        <p>We may suspend or close accounts that do.</p>
      </Section>

      <Section title="6. The AI assistant acting for you">
        <p>
          The assistant can create and change tasks and reminders when you ask. Every change is shown to you and can be
          undone; deleting anything always needs your confirmation. You remain responsible for reviewing what it does.
        </p>
      </Section>

      <Section title="7. Availability">
        <p>
          Velora is provided &ldquo;as is&rdquo;. AI features have daily limits and may be paused when they are reached;
          everything else keeps working. We may change or discontinue features, and will tell you in advance of anything
          that affects your data.
        </p>
      </Section>

      <Section title="8. Ending">
        <p>
          You can stop using Velora and delete your account at any time (Settings → Delete your account), which deletes
          your data as described in the Privacy Policy. You can download your data first.
        </p>
      </Section>

      <Section title="9. Liability">
        <p>
          To the extent the law allows, we are not liable for indirect or consequential losses, or for losses caused by
          relying on AI output, reminders or extracted details without checking them. Nothing in these terms limits
          liability that cannot be limited by law, or your rights as a consumer under the law where you live.
          [Liability cap and wording to be confirmed by a lawyer.]
        </p>
      </Section>

      <Section title="10. Law and changes">
        <p>
          These terms are governed by {d.governingLaw}. If we change them in a way that matters, we&apos;ll ask you to
          accept the new version the next time you open Velora.
        </p>
      </Section>
    </article>
  );
}
