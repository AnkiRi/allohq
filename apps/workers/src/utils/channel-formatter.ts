/**
 * Format agent response text for different messaging channels.
 * Widget gets raw markdown, WhatsApp gets simplified formatting,
 * SMS gets plain text with shortened URLs.
 */

/** Format response for WhatsApp (supports basic markdown: bold, italic, links) */
export function formatForWhatsApp(text: string, toolCalls?: Array<{ name: string; output: unknown }>): string {
  let formatted = text;

  // WhatsApp supports *bold*, _italic_, ~strikethrough~, ```code```
  // Our agent uses **bold** (markdown) — convert to *bold* (WhatsApp)
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, "*$1*");

  // Convert markdown links [text](url) to "text: url"
  formatted = formatted.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2");

  // Add product links from tool calls
  if (toolCalls) {
    const productCalls = toolCalls.filter(
      (tc) => tc.name === "search_products" || tc.name === "recommend_products"
    );
    for (const tc of productCalls) {
      const products = Array.isArray(tc.output) ? tc.output : [];
      if (products.length > 0) {
        formatted += "\n\n";
        for (const p of products.slice(0, 3)) {
          const prod = p as Record<string, unknown>;
          formatted += `${prod.title} — $${Number(prod.price ?? 0).toFixed(2)}`;
          if (prod.handle) {
            formatted += `\nhttps://${prod.storeDomain ?? "shop"}/products/${prod.handle}`;
          }
          formatted += "\n\n";
        }
      }
    }
  }

  // Add discount code prominently
  if (toolCalls) {
    const discountCall = toolCalls.find((tc) => tc.name === "create_discount_code");
    if (discountCall) {
      const out = discountCall.output as Record<string, unknown>;
      if (out?.success && out?.code) {
        formatted += `\n\nUse code *${out.code}* for ${out.description} at checkout.`;
      }
    }
  }

  return formatted.trim();
}

/** Format response for SMS (plain text, no markdown, short URLs) */
export function formatForSms(text: string, toolCalls?: Array<{ name: string; output: unknown }>): string {
  let formatted = text;

  // Strip all markdown formatting
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, "$1");  // bold
  formatted = formatted.replace(/\*(.*?)\*/g, "$1");       // italic
  formatted = formatted.replace(/~~(.*?)~~/g, "$1");       // strikethrough
  formatted = formatted.replace(/`(.*?)`/g, "$1");         // inline code

  // Convert markdown links to just URL
  formatted = formatted.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, "$1 $2");

  // Remove markdown headers
  formatted = formatted.replace(/^#{1,6}\s+/gm, "");

  // Remove bullet points formatting (keep the text)
  formatted = formatted.replace(/^[-*]\s+/gm, "- ");

  // Add discount code for SMS
  if (toolCalls) {
    const discountCall = toolCalls.find((tc) => tc.name === "create_discount_code");
    if (discountCall) {
      const out = discountCall.output as Record<string, unknown>;
      if (out?.success && out?.code) {
        formatted += `\n\nCode: ${out.code} (${out.description})`;
      }
    }
  }

  // SMS has 160 char segments — truncate if too long
  if (formatted.length > 1500) {
    formatted = formatted.substring(0, 1497) + "...";
  }

  return formatted.trim();
}

/** Format response for widget (return raw — widget renderer handles markdown) */
export function formatForWidget(text: string): string {
  return text;
}

/** Pick the right formatter based on channel */
export function formatForChannel(
  channel: string,
  text: string,
  toolCalls?: Array<{ name: string; output: unknown }>
): string {
  switch (channel) {
    case "whatsapp":
      return formatForWhatsApp(text, toolCalls);
    case "sms":
      return formatForSms(text, toolCalls);
    case "widget":
    default:
      return formatForWidget(text);
  }
}
