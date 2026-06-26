import { redirect } from "next/navigation";

// The standalone single-email screen is retired. Emails live in the Library
// (/templates) — browse there, or "New Template" opens the goal wizard to create
// one. The editor itself (EmailStudio) is reached via /templates/[id]/edit. This
// route just forwards anyone with an old /emails link to the Library.
export default function EmailsPage() {
  redirect("/templates");
}
