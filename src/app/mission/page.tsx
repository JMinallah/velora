import { redirect } from "next/navigation";

// /mission has no content of its own (missions live at /mission/[id]).
// Without this page, Next's route prefetch of the parent segment 404s.
export default function MissionIndexPage() {
  redirect("/");
}
