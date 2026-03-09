import type { EmailBlock, RenderOptions, ProductData, HeaderBlock, FooterBlock, ArchetypeRenderOptions } from "../types";

/** Interpolate merge tags like {{first_name}} in a string */
function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w[\w.]*)\}\}/g, (_match, key: string) => {
    return variables[key] ?? `{{${key}}}`;
  });
}

/** Escape HTML entities */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format price as $XX.XX */
function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/** Render a single block to HTML */
function renderBlock(block: EmailBlock, options: RenderOptions): string {
  const { variables, products } = options;

  switch (block.type) {
    case "text": {
      const { html, align = "left", fontSize = 16, color = "#333333", fontFamily = "Arial, sans-serif" } = block.props;
      const content = interpolate(html, variables);
      return `
        <tr>
          <td style="padding: 8px 24px; text-align: ${align}; font-size: ${fontSize}px; color: ${color}; font-family: ${fontFamily}; line-height: 1.6;">
            ${content}
          </td>
        </tr>`;
    }

    case "image": {
      const { src, alt = "", width, height, href, align = "center" } = block.props;
      const imgStyle = [
        "max-width: 100%",
        "display: block",
        width ? `width: ${width}px` : "",
        height ? `height: ${height}px` : "",
      ].filter(Boolean).join("; ");
      const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="${imgStyle}" />`;
      const wrapped = href ? `<a href="${escapeHtml(interpolate(href, variables))}" target="_blank">${img}</a>` : img;
      return `
        <tr>
          <td style="padding: 8px 24px; text-align: ${align};">
            ${wrapped}
          </td>
        </tr>`;
    }

    case "button": {
      const { text, href, bgColor = "#000000", textColor = "#FFFFFF", borderRadius = 4, align = "center", fullWidth = false } = block.props;
      const btnStyle = [
        `background-color: ${bgColor}`,
        `color: ${textColor}`,
        `border-radius: ${borderRadius}px`,
        "padding: 12px 24px",
        "text-decoration: none",
        "font-family: Arial, sans-serif",
        "font-size: 14px",
        "font-weight: bold",
        "display: inline-block",
        fullWidth ? "width: 100%; text-align: center; box-sizing: border-box" : "",
      ].filter(Boolean).join("; ");
      return `
        <tr>
          <td style="padding: 16px 24px; text-align: ${align};">
            <a href="${escapeHtml(interpolate(href, variables))}" target="_blank" style="${btnStyle}">
              ${escapeHtml(interpolate(text, variables))}
            </a>
          </td>
        </tr>`;
    }

    case "divider": {
      const { color = "#E5E7EB", thickness = 1, margin = 16 } = block.props;
      return `
        <tr>
          <td style="padding: ${margin}px 24px;">
            <hr style="border: none; border-top: ${thickness}px solid ${color}; margin: 0;" />
          </td>
        </tr>`;
    }

    case "spacer": {
      const { height } = block.props;
      return `
        <tr>
          <td style="height: ${height}px; line-height: ${height}px; font-size: 1px;">&nbsp;</td>
        </tr>`;
    }

    case "product": {
      const { productId, showPrice = true, showDescription = true, showImage = true, buttonText = "Shop Now", buttonHref = "#", source } = block.props;
      // For dynamic sources, try dynamicProducts first, then fall back to products map
      let product: ProductData | undefined;
      if (source && source !== "manual" && options.dynamicProducts?.length) {
        product = options.dynamicProducts[0];
      } else {
        product = products?.[productId];
      }
      if (!product) {
        return `
          <tr>
            <td style="padding: 16px 24px; text-align: center; color: #999; font-family: Arial, sans-serif;">
              ${options.previewMode ? "[Product placeholder]" : ""}
            </td>
          </tr>`;
      }
      return `
        <tr>
          <td style="padding: 16px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${showImage && product.imageUrl ? `
                  <td width="40%" style="padding-right: 16px; vertical-align: top;">
                    <img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" style="max-width: 100%; display: block; border-radius: 4px;" />
                  </td>` : ""}
                <td style="vertical-align: top; font-family: Arial, sans-serif;">
                  <p style="font-size: 18px; font-weight: bold; margin: 0 0 8px; color: #111;">${escapeHtml(product.title)}</p>
                  ${showDescription && product.description ? `<p style="font-size: 14px; color: #666; margin: 0 0 12px; line-height: 1.5;">${escapeHtml(product.description)}</p>` : ""}
                  ${showPrice ? `
                    <p style="font-size: 16px; font-weight: bold; margin: 0 0 16px; color: #111;">
                      ${formatPrice(product.price)}
                      ${product.compareAtPrice ? `<span style="text-decoration: line-through; color: #999; font-weight: normal; margin-left: 8px;">${formatPrice(product.compareAtPrice)}</span>` : ""}
                    </p>` : ""}
                  <a href="${escapeHtml(interpolate(buttonHref || "#", variables))}" target="_blank" style="background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; font-size: 13px; font-weight: bold; border-radius: 4px; display: inline-block;">
                    ${escapeHtml(buttonText)}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case "product_grid": {
      const { productIds, columns = 2, showPrice = true, showDescription = false, source: gridSource, dynamicProductCount } = block.props;
      const colWidth = Math.floor(100 / columns);

      // For dynamic grids, use dynamicProducts instead of productIds
      let effectiveProductIds = productIds;
      if (gridSource && gridSource !== "manual" && dynamicProductCount && options.dynamicProducts?.length) {
        effectiveProductIds = options.dynamicProducts.slice(0, dynamicProductCount).map((p) => p.id);
        // Inject dynamic products into the products map for rendering
        for (const dp of options.dynamicProducts) {
          if (!products?.[dp.id]) {
            if (!options.products) (options as { products: Record<string, ProductData> }).products = {};
            options.products![dp.id] = dp;
          }
        }
      }

      const productCells = effectiveProductIds.map((pid) => {
        const product = products?.[pid];
        if (!product) return `<td width="${colWidth}%" style="padding: 8px; vertical-align: top;"></td>`;
        return `
          <td width="${colWidth}%" style="padding: 8px; vertical-align: top; font-family: Arial, sans-serif;">
            ${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" style="max-width: 100%; display: block; border-radius: 4px; margin-bottom: 8px;" />` : ""}
            <p style="font-size: 14px; font-weight: bold; margin: 0 0 4px; color: #111;">${escapeHtml(product.title)}</p>
            ${showDescription && product.description ? `<p style="font-size: 12px; color: #666; margin: 0 0 4px;">${escapeHtml(product.description)}</p>` : ""}
            ${showPrice ? `<p style="font-size: 14px; font-weight: bold; margin: 0; color: #111;">${formatPrice(product.price)}</p>` : ""}
          </td>`;
      });

      // Split into rows
      const rows: string[] = [];
      for (let i = 0; i < productCells.length; i += columns) {
        const rowCells = productCells.slice(i, i + columns);
        while (rowCells.length < columns) {
          rowCells.push(`<td width="${colWidth}%" style="padding: 8px;"></td>`);
        }
        rows.push(`<tr>${rowCells.join("")}</tr>`);
      }

      return `
        <tr>
          <td style="padding: 8px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${rows.join("")}
            </table>
          </td>
        </tr>`;
    }

    case "columns": {
      const { columns, columnWidths } = block.props;
      const defaultWidth = Math.floor(100 / columns.length);
      const cells = columns.map((colBlocks, i) => {
        const width = columnWidths?.[i] ?? defaultWidth;
        const inner = colBlocks.map((b) => renderBlock(b, options)).join("");
        return `
          <td width="${width}%" style="vertical-align: top;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${inner}
            </table>
          </td>`;
      });
      return `
        <tr>
          <td style="padding: 0 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>${cells.join("")}</tr>
            </table>
          </td>
        </tr>`;
    }

    case "social": {
      const { links } = block.props;
      if (links.length === 0) return "";
      const items = links.map((link) => {
        return `<a href="${escapeHtml(link.url)}" target="_blank" style="display: inline-block; margin: 0 8px; color: #666; text-decoration: none; font-size: 13px; font-family: Arial, sans-serif;">${escapeHtml(link.platform)}</a>`;
      }).join("");
      return `
        <tr>
          <td style="padding: 16px 24px; text-align: center;">
            ${items}
          </td>
        </tr>`;
    }

    case "header": {
      const { logoSrc, logoAlt = "", bgColor = "#FFFFFF", align = "center" } = block.props;
      return `
        <tr>
          <td style="padding: 24px; text-align: ${align}; background-color: ${bgColor};">
            ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(logoAlt)}" style="max-height: 48px; display: inline-block;" />` : ""}
          </td>
        </tr>`;
    }

    case "footer": {
      const { text, unsubscribeText = "Unsubscribe" } = block.props;
      return `
        <tr>
          <td style="padding: 24px; text-align: center; font-size: 12px; color: #999; font-family: Arial, sans-serif; line-height: 1.5;">
            <p style="margin: 0 0 8px;">${interpolate(text, variables)}</p>
            <a href="${variables.unsubscribe_url ?? '#'}" style="color: #999; text-decoration: underline;">${escapeHtml(unsubscribeText)}</a>
          </td>
        </tr>`;
    }

    case "hero": {
      const { heading, subtext, buttonText, buttonHref, bgColor = "#000000", textColor = "#FFFFFF", align = "center" } = block.props;
      const bgImage = block.props.bgImageSrc ? `background-image: url('${escapeHtml(block.props.bgImageSrc)}'); background-size: cover; background-position: center;` : "";
      return `
        <tr>
          <td style="padding: 48px 32px; text-align: ${align}; background-color: ${bgColor}; ${bgImage} font-family: Arial, sans-serif;">
            <h1 style="margin: 0 0 12px; font-size: 32px; font-weight: bold; color: ${textColor}; line-height: 1.2;">${escapeHtml(interpolate(heading, variables))}</h1>
            ${subtext ? `<p style="margin: 0 0 24px; font-size: 16px; color: ${textColor}; opacity: 0.85; line-height: 1.5;">${escapeHtml(interpolate(subtext, variables))}</p>` : ""}
            ${buttonText && buttonHref ? `<a href="${escapeHtml(interpolate(buttonHref, variables))}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${textColor}; color: ${bgColor}; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: 6px;">${escapeHtml(interpolate(buttonText, variables))}</a>` : ""}
          </td>
        </tr>`;
    }

    case "icon_row": {
      const { items } = block.props;
      const colWidth = Math.floor(100 / Math.max(items.length, 1));
      const cells = items.map((item) => `
        <td width="${colWidth}%" style="padding: 16px 8px; text-align: center; vertical-align: top; font-family: Arial, sans-serif;">
          <div style="font-size: 28px; line-height: 1; margin-bottom: 8px;">${escapeHtml(item.icon)}</div>
          <p style="margin: 0; font-size: 13px; font-weight: bold; color: #333;">${escapeHtml(item.label)}</p>
          ${item.description ? `<p style="margin: 4px 0 0; font-size: 11px; color: #999;">${escapeHtml(item.description)}</p>` : ""}
        </td>`).join("");
      return `
        <tr>
          <td style="padding: 8px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>${cells}</tr>
            </table>
          </td>
        </tr>`;
    }

    case "countdown": {
      const { endDate, label, bgColor = "#FF0000", textColor = "#FFFFFF" } = block.props;
      const end = new Date(endDate);
      const now = new Date();
      const diffMs = Math.max(0, end.getTime() - now.getTime());
      const days = Math.ceil(diffMs / 86400000);
      const displayText = days > 0 ? `${days} day${days !== 1 ? "s" : ""} left` : "Ending soon!";
      return `
        <tr>
          <td style="padding: 20px 24px; text-align: center; background-color: ${bgColor}; font-family: Arial, sans-serif;">
            <p style="margin: 0 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: ${textColor}; opacity: 0.85;">${escapeHtml(interpolate(label, variables))}</p>
            <p style="margin: 0; font-size: 28px; font-weight: bold; color: ${textColor};">${displayText}</p>
          </td>
        </tr>`;
    }

    case "testimonial": {
      const { quote, author, rating, avatarUrl } = block.props;
      const stars = rating ? "★".repeat(Math.min(rating, 5)) + "☆".repeat(Math.max(0, 5 - rating)) : "";
      return `
        <tr>
          <td style="padding: 24px 32px; font-family: Arial, sans-serif;">
            <div style="background-color: #F9FAFB; border-radius: 12px; padding: 24px; border-left: 4px solid #E5E7EB;">
              ${stars ? `<p style="margin: 0 0 8px; font-size: 18px; color: #F59E0B; letter-spacing: 2px;">${stars}</p>` : ""}
              <p style="margin: 0 0 12px; font-size: 15px; font-style: italic; color: #374151; line-height: 1.6;">"${escapeHtml(interpolate(quote, variables))}"</p>
              <div style="display: flex; align-items: center;">
                ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 8px;" />` : ""}
                <p style="margin: 0; font-size: 13px; font-weight: bold; color: #6B7280;">— ${escapeHtml(author)}</p>
              </div>
            </div>
          </td>
        </tr>`;
    }

    default:
      return "";
  }
}

/** Inject UTM params into all <a href> URLs matching the store domain */
function injectUtmParams(html: string, options: RenderOptions): string {
  const { tracking } = options;
  if (!tracking) return html;

  return html.replace(/href="([^"]+)"/g, (_match, url: string) => {
    // Skip unsubscribe, mailto, anchor-only links
    if (url.startsWith("mailto:") || url.startsWith("#") || url.includes("unsubscribe")) {
      return `href="${url}"`;
    }
    // Skip non-http links
    if (!url.startsWith("http")) {
      return `href="${url}"`;
    }
    // Skip if URL doesn't match store domain (when specified)
    if (tracking.storeDomain && !url.includes(tracking.storeDomain)) {
      return `href="${url}"`;
    }
    const separator = url.includes("?") ? "&" : "?";
    const params = [
      `utm_source=${encodeURIComponent(tracking.utmSource)}`,
      `utm_medium=${encodeURIComponent(tracking.utmMedium)}`,
      `utm_campaign=${encodeURIComponent(tracking.utmCampaign)}`,
      ...(tracking.utmContent ? [`utm_content=${encodeURIComponent(tracking.utmContent)}`] : []),
    ].join("&");
    return `href="${url}${separator}${params}"`;
  });
}

/** Render an array of email blocks to a complete HTML email string */
export function renderToHtml(blocks: EmailBlock[], options: RenderOptions): string {
  let finalBlocks = [...blocks];

  // Auto-inject header if brandSettings has a logo but blocks don't start with header
  if (options.brandSettings?.logoUrl && finalBlocks[0]?.type !== "header") {
    const headerBlock: HeaderBlock = {
      id: "auto-header",
      type: "header",
      props: {
        logoSrc: options.brandSettings.logoUrl,
        logoAlt: options.brandSettings.storeName ?? "Logo",
        bgColor: options.brandSettings.headerBgColor ?? "#FFFFFF",
      },
    };
    finalBlocks.unshift(headerBlock);
  }

  // Auto-inject footer if brandSettings exist but blocks don't end with footer
  if (options.brandSettings && finalBlocks[finalBlocks.length - 1]?.type !== "footer") {
    const bs = options.brandSettings;
    const footerParts: string[] = [];
    if (bs.showAddress !== false && bs.address) footerParts.push(`${bs.storeName ?? ""} · ${bs.address}`);
    if (bs.showSocialLinks !== false && bs.socialLinks?.length) {
      footerParts.push(bs.socialLinks.map((l) => l.platform).join(" · "));
    }
    if (bs.footerText) footerParts.push(bs.footerText);
    if (footerParts.length === 0 && bs.storeName) footerParts.push(bs.storeName);

    const footerBlock: FooterBlock = {
      id: "auto-footer",
      type: "footer",
      props: {
        text: footerParts.join("\n") || "Sent with Allo",
        unsubscribeText: "Unsubscribe",
      },
    };
    finalBlocks.push(footerBlock);
  }

  let blockHtml = finalBlocks.map((block) => renderBlock(block, options)).join("\n");

  // Inject UTM tracking params
  blockHtml = injectUtmParams(blockHtml, options);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title></title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .email-container td { padding-left: 16px !important; padding-right: 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F5F5;">
  <center>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #F5F5F5;">
      <tr>
        <td style="padding: 24px 0;">
          <table class="email-container" role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center" style="max-width: 600px; background-color: #FFFFFF; border-radius: 8px; overflow: hidden;">
${blockHtml}
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;
}

/**
 * Render an email from an MJML archetype template.
 * Used for AI-generated campaigns that go through the creative-engine pipeline.
 *
 * This is a pass-through interface: the actual MJML rendering is done by
 * @allohq/creative-engine. Consumers should import renderMjmlTemplate
 * directly from creative-engine for full functionality.
 *
 * This export exists so email-builder exposes the type and concept,
 * keeping it as the single "email rendering" API surface.
 */
export function renderFromArchetype(_options: ArchetypeRenderOptions): string | null {
  // Consumers should use @allohq/creative-engine.renderMjmlTemplate() directly.
  // This stub exists to maintain the API surface in email-builder.
  return null;
}
