import { contrastRatio, MIN_LARGE_CONTRAST } from "./contrast";
import { findTokens } from "./personalization";
import type { EmailBlock } from "./types";

export type EmailPreflightCheck = {
  id: string;
  label: string;
  severity: "error" | "warning" | "info";
  passed: boolean;
  detail: string;
};

function collectLinksAndImages(blocks: EmailBlock[]): {
  links: string[];
  missingAlt: string[];
  unsafeHtml: boolean;
} {
  const links: string[] = [];
  const missingAlt: string[] = [];
  let unsafeHtml = false;
  for (const block of blocks) {
    if (block.type === "image") {
      if (!block.props.alt?.trim()) missingAlt.push(block.id);
      if (block.props.href) links.push(block.props.href);
    }
    if (block.type === "button") links.push(block.props.href);
    if (block.type === "hero" && block.props.buttonHref) links.push(block.props.buttonHref);
    if (block.type === "product" && block.props.buttonHref) links.push(block.props.buttonHref);
    if (block.type === "custom_html") {
      unsafeHtml ||= /<(script|iframe|form|input|object|embed)\b|\son\w+\s*=|javascript:/i.test(block.props.html);
    }
    if (block.type === "columns") {
      const nested = collectLinksAndImages(block.props.columns.flat());
      links.push(...nested.links);
      missingAlt.push(...nested.missingAlt);
      unsafeHtml ||= nested.unsafeHtml;
    }
  }
  return { links, missingAlt, unsafeHtml };
}

/** Colour pairs a block states outright, so contrast is measurable. */
function measurableContrast(blocks: EmailBlock[]): { blockId: string; ratio: number }[] {
  const found: { blockId: string; ratio: number }[] = [];
  const walk = (list: EmailBlock[]) => {
    for (const block of list) {
      if (block.type === "hero") {
        const ratio = contrastRatio(block.props.textColor, block.props.bgColor);
        if (ratio !== null) found.push({ blockId: block.id, ratio });
      }
      if (block.type === "button") {
        const ratio = contrastRatio(block.props.textColor, block.props.bgColor);
        if (ratio !== null) found.push({ blockId: block.id, ratio });
      }
      if (block.type === "columns") walk(block.props.columns.flat());
    }
  };
  walk(blocks);
  return found;
}

/** Images whose pixels Joon generated rather than a merchant supplying them. */
function generatedImages(blocks: EmailBlock[], generatedAssetUrls: Set<string>): string[] {
  const found: string[] = [];
  const walk = (list: EmailBlock[]) => {
    for (const block of list) {
      if (block.type === "image" && generatedAssetUrls.has(block.props.src)) found.push(block.id);
      if (block.type === "hero" && block.props.bgImageSrc && generatedAssetUrls.has(block.props.bgImageSrc)) {
        found.push(block.id);
      }
      if (block.type === "columns") walk(block.props.columns.flat());
    }
  };
  walk(blocks);
  return found;
}

export function preflightEmailDocument(input: {
  subject: string;
  previewText?: string | null;
  blocks: EmailBlock[];
  expectedDiscountPercent?: number | null;
  expectedDiscountCode?: string | null;
  /** URLs of assets Joon generated, so their use can be flagged for review. */
  generatedAssetUrls?: string[];
}) {
  const { links, missingAlt, unsafeHtml } = collectLinksAndImages(input.blocks);
  const artifactText = `${input.subject}\n${input.previewText ?? ""}\n${JSON.stringify(input.blocks)}`;

  // Personalization is checked on the text a customer actually reads: the
  // subject, the inbox preview, and the block copy. A token Joon cannot fill
  // renders as nothing, which turns "Hi {{firstname}}," into "Hi ," — quieter
  // than the old literal tag, and still wrong.
  const personalizationText = `${input.subject}\n${input.previewText ?? ""}\n${JSON.stringify(input.blocks)}`;
  const tokenUses = findTokens(personalizationText);
  const unfillable = [...new Set(tokenUses.filter((use) => !use.known).map((use) => use.key))];
  const withoutFallback = [...new Set(
    tokenUses.filter((use) => use.known && (use.fallback === null || use.fallback === "")).map((use) => use.key),
  )];
  const percentMatches = [...artifactText.matchAll(/\b(\d{1,2})\s*%/g)].map((match) => Number(match[1]));
  const uniquePercents = [...new Set(percentMatches)];
  const discountTerms = /\b(discount|coupon|promo code|use code|%\s*off|sale)\b/i.test(artifactText);
  const expectedPercent = input.expectedDiscountPercent ?? null;
  const expectedCode = input.expectedDiscountCode?.trim() || null;
  const hasOfferConstraint = Object.prototype.hasOwnProperty.call(input, "expectedDiscountPercent") || Object.prototype.hasOwnProperty.call(input, "expectedDiscountCode");
  const offerMismatch = !hasOfferConstraint
    ? false
    : expectedPercent == null
    ? discountTerms || uniquePercents.length > 0 || Boolean(expectedCode && artifactText.includes(expectedCode))
    : uniquePercents.some((value) => value !== expectedPercent);

  const checks: EmailPreflightCheck[] = [
    { id: "subject", label: "Subject is present", severity: "error", passed: input.subject.trim().length > 0, detail: input.subject.trim() ? `${input.subject.length} characters` : "Add a subject before approval." },
    { id: "preview_text", label: "Inbox preview is present", severity: "warning", passed: Boolean(input.previewText?.trim()), detail: input.previewText?.trim() ? `${input.previewText.length} characters` : "Add preview text so inboxes do not pull arbitrary body copy." },
    { id: "image_alt", label: "Images have alt text", severity: "warning", passed: missingAlt.length === 0, detail: missingAlt.length ? `${missingAlt.length} image${missingAlt.length === 1 ? "" : "s"} need alt text.` : "All images are described." },
    { id: "links", label: "Links are structurally usable", severity: "error", passed: links.every((link) => /^(https?:\/\/|#|\{\{)/.test(link)), detail: `${links.length} link${links.length === 1 ? "" : "s"} checked.` },
    { id: "custom_html", label: "Custom code is safe", severity: "error", passed: !unsafeHtml, detail: unsafeHtml ? "Scripts, forms, frames and event handlers are not allowed." : "No unsafe markup detected." },
    {
      id: "personalization_known",
      label: "Personalization can be filled",
      severity: "error",
      passed: unfillable.length === 0,
      detail: unfillable.length
        ? `Joon has no value for ${unfillable.map((key) => `{{${key}}}`).join(", ")} — it would render as nothing. Insert the field from the Shopify data tab.`
        : tokenUses.length
        ? `${tokenUses.length} personalization token${tokenUses.length === 1 ? "" : "s"} checked.`
        : "No personalization used.",
    },
    {
      id: "personalization_fallback",
      label: "Personalization has a fallback",
      severity: "warning",
      passed: withoutFallback.length === 0,
      detail: withoutFallback.length
        ? `${withoutFallback.map((key) => `{{${key}}}`).join(", ")} has no written fallback. Customers missing that value see the default instead.`
        : "Every token names what to show when the value is missing.",
    },
    (() => {
      const measured = measurableContrast(input.blocks);
      const failing = measured.filter((item) => item.ratio < MIN_LARGE_CONTRAST);
      return {
        id: "contrast",
        label: "Stated colours are readable",
        severity: "warning" as const,
        passed: failing.length === 0,
        detail: !measured.length
          ? "No block states both a text and a background colour, so there is nothing to measure here."
          : failing.length
          ? `${failing.length} block${failing.length === 1 ? "" : "s"} fall below ${MIN_LARGE_CONTRAST}:1 (lowest ${failing[0]!.ratio.toFixed(1)}:1).`
          : `${measured.length} colour pair${measured.length === 1 ? "" : "s"} checked, all at least ${MIN_LARGE_CONTRAST}:1.`,
      };
    })(),
    (() => {
      const generated = generatedImages(input.blocks, new Set(input.generatedAssetUrls ?? []));
      return {
        id: "generated_imagery",
        label: "Generated imagery is reviewed",
        severity: "info" as const,
        passed: true,
        detail: generated.length
          ? `${generated.length} image${generated.length === 1 ? " was" : "s were"} generated by Joon. Look at them before approving — Joon does not read text inside images, so any wording baked into one is unchecked.`
          : "No generated imagery in this email.",
      };
    })(),
    { id: "offer", label: "Offer matches the campaign", severity: "error", passed: !offerMismatch, detail: !hasOfferConstraint ? "Exact offer consistency runs when this version is attached to a campaign." : offerMismatch ? "The creative contains discount language or a percentage that does not match the approved offer." : expectedPercent == null ? "No unapproved discount language detected." : `${expectedPercent}% offer is consistent.` },
  ];
  return {
    checks,
    passed: checks.filter((check) => check.passed).length,
    blockingFailures: checks.filter((check) => !check.passed && check.severity === "error"),
    warnings: checks.filter((check) => !check.passed && check.severity === "warning"),
  };
}
