"use client";

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className = "",
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full text-destructive" style={{ backgroundColor: "color-mix(in srgb, var(--color-urgent) 12%, transparent)" }}>
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="mb-1 text-lg font-semibold text-foreground">{title}</h3>
      {message && (
        <p className="mb-4 max-w-md text-center text-sm text-muted-foreground">{message}</p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
        >
          Try again
        </button>
      )}
    </div>
  );
}
