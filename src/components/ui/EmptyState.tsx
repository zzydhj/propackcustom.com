export function EmptyState({ label }: { label: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-neutral-300 bg-white py-20 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-neutral-100 text-neutral-400">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-neutral-500">{label}</p>
    </div>
  );
}
