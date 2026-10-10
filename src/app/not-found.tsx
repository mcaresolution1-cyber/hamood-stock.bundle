import { NotFoundView } from "@/components/not-found-view";

/** Unknown URLs (outside any page). */
export default function NotFound() {
  return (
    <main className="px-4">
      <NotFoundView />
    </main>
  );
}
