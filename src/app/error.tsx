"use client";

import { ErrorView } from "@/components/error-view";

/** Errors outside the (app) segment, and errors thrown by the (app) layout itself (e.g. database down). */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="px-4">
      <ErrorView error={error} retry={retry} />
    </main>
  );
}
