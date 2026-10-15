/**
 * Legal texts' version and the details they name (docs/08-LEGAL-RISKS.md).
 * Bump LEGAL_VERSION whenever the terms or privacy policy change in
 * substance: everyone is asked to accept again on their next visit.
 * Client-safe: no server imports.
 */
export const LEGAL_VERSION = "2026-10-15"

/** Shown in the documents until filled in for launch (owner, contact, governing law). */
export const LEGAL_DETAILS = {
  operator: "[Operator: your full legal name, or the company's registered name and number]",
  address: "[Postal address in Kenya]",
  contactEmail: "[privacy@your-domain]",
  governingLaw: "the laws of Kenya [confirm with a lawyer]",
}

/** Minimum age to use Velora (Gemini API terms; the product handles identity documents). */
export const MINIMUM_AGE = 18
