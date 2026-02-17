/** A single block in an email template */
export interface EmailBlock {
  id: string;
  type: "text" | "image" | "button" | "divider" | "product" | "columns";
  props: Record<string, unknown>;
  children?: EmailBlock[];
}

/** A complete email template */
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  blocks: EmailBlock[];
  metadata: Record<string, string>;
}

/** Options for rendering an email template to HTML */
export interface RenderOptions {
  variables: Record<string, string>;
  previewMode: boolean;
  inlineCss: boolean;
}
