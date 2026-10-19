import { redirect } from "next/navigation";

/** /admin has no page of its own: the admin pages are in the sidebar. */
export default function AdminIndex() {
  redirect("/");
}
