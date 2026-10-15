/** Shared building blocks of the legal pages (/privacy, /terms). */
export function DraftNotice() {
  return (
    <p role="note" className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      Draft pending legal review. Details in [brackets] are filled in before launch.
    </p>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
