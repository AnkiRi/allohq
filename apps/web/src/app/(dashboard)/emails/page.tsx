import { renderGeneratedEmail } from "@allohq/emails";
import { EmailStudio } from "@/components/emails/EmailStudio";
import {
  buildVanaBrandKit,
  VANA_SEED_BLOCKS,
  VANA_SEED_SUBJECT,
  VANA_SEED_PREVIEW,
} from "./vana-seed";

export const metadata = {
  title: "Emails: allo wrote this, edit anything",
};

// Preview variables so the seed renders with real-looking values
// (the editor shows merge tags resolved, like an inbox would).
const PREVIEW_VARIABLES: Record<string, string> = {
  first_name: "Aanya",
  last_order_month: "October",
};

/**
 * /emails — the generate-first, edit-freely studio.
 *
 * allo generates a pixel-perfect, on-brand Vana email (EmailBlock[]), rendered
 * server-side here for an instant first paint. The client EmailStudio then lets
 * the human edit it two ways — prompt-edit and direct manipulation — with every
 * edit round-tripping back through EmailBlock[] → @allohq/emails for a live,
 * cross-client-safe preview.
 */
export default async function EmailsPage() {
  const brandKit = buildVanaBrandKit();

  const initialHtml = await renderGeneratedEmail(
    {
      blocks: VANA_SEED_BLOCKS,
      subject: VANA_SEED_SUBJECT,
      previewText: VANA_SEED_PREVIEW,
    },
    brandKit,
    { variables: PREVIEW_VARIABLES, previewMode: true },
  );

  return (
    <EmailStudio
      initialBlocks={VANA_SEED_BLOCKS}
      initialSubject={VANA_SEED_SUBJECT}
      initialPreviewText={VANA_SEED_PREVIEW}
      initialHtml={initialHtml}
      brandKit={brandKit}
      previewVariables={PREVIEW_VARIABLES}
    />
  );
}
