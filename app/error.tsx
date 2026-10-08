"use client";

export default function BoardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 md:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Clerk</h1>
      <p className="max-w-prose text-base text-foreground">
        PayPal did not return the invoices. Check the sandbox credentials, then try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="h-10 w-fit rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Try again
      </button>
    </main>
  );
}
