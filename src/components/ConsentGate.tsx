"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LEGAL_VERSION, MINIMUM_AGE } from "@/lib/legal";

/**
 * Asks a signed-in user, once per version of the terms, to confirm they're
 * 18+ and accept the Terms and Privacy Policy (docs/08-LEGAL-RISKS.md A3,
 * C1). The acceptance is stored with its version and time. The legal pages
 * themselves stay readable without accepting.
 */
export function ConsentGate() {
  const pathname = usePathname();
  const [needed, setNeeded] = useState(false);
  const [adult, setAdult] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/consent")
      .then((res) => (res.ok ? res.json() : null)) // 401 when signed out: nothing to ask
      .then((data) => !cancelled && data?.success && setNeeded(!data.data.current))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needed || pathname === "/privacy" || pathname === "/terms") return null;

  async function accept() {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptTerms: LEGAL_VERSION, adult: true }),
      });
      if (!res.ok) throw new Error();
      setNeeded(false);
    } catch {
      setError("Couldn't save that — please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="w-full max-w-lg space-y-4 rounded-xl bg-background p-6 shadow-lg">
        <h2 id="consent-title" className="text-lg font-semibold">
          Before you start
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Velora helps you organise a big move or change. It is an AI and can be wrong, and it doesn&apos;t give legal, immigration, medical or financial advice — check important details with official sources.</li>
          <li>Your missions, chats and documents are stored with our providers (MongoDB, Cloudflare, Google), including outside Kenya. AI features send what they need to Google&apos;s Gemini.</li>
          <li>You can download or delete everything at any time in Settings.</li>
        </ul>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>I am {MINIMUM_AGE} or older.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="underline">
              Terms of Service
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" target="_blank" className="underline">
              Privacy Policy
            </Link>
            , including storing my data with the providers named there.
          </span>
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={!adult || !agreed || isSaving} onClick={accept}>
          {isSaving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
