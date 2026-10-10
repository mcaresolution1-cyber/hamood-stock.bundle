import { PageSkeleton } from "@/components/page-skeleton";

/** Inside the reports layout, so the title and tabs stay while a report loads. */
export default function Loading() {
  return <PageSkeleton header={false} rows={8} />;
}
