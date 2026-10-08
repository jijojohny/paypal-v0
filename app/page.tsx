import { Suspense } from "react";
import { InvoiceBoard } from "./invoice-board";

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Clerk</h1>
        <p className="max-w-prose text-base text-muted-foreground">
          Clerk watches unpaid PayPal invoices, drafts the follow-up, and waits for you to approve it.
        </p>
      </header>
      <Suspense fallback={<BoardSkeleton />}>
        <InvoiceBoard />
      </Suspense>
    </main>
  );
}
