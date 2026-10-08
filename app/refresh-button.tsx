"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      className="h-10 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
    >
      {pending ? "Refreshing" : "Refresh"}
    </button>
  );
}
