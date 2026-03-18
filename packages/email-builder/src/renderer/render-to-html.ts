import mjml2html from "mjml";
import type {
  EmailBlock,
  RenderOptions,
  ProductData,
  HeaderBlock,
  FooterBlock,
  ArchetypeRenderOptions,
} from "../types";

// ============================================================================
// Utility functions (preserved from original)
// ============================================================================

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

// ============================================================================
// MJML Block Renderer
// ============================================================================

/** Render a single block to MJML markup */
function renderBlockToMjml(block: EmailBlock, options: RenderOptions): string {
  const { variables, products } = options;

  switch (block.type) {
    case "text": {
      const {
        html,
        align = "left",
        fontSize = 16,
        color = "#333333",
        fontFamily = "Arial, sans-serif",
      } = block.props;
      const content = interpolate(html, variables);
      return `
        <mj-section padding="0">
          <mj-column>
            <mj-text align="${align}" font-size="${fontSize}px" color="${color}" font-family="${fontFamily}" line-height="1.6" padding="8px 24px">
              ${content}
            </mj-text>
          </mj-column>
        </mj-section>`;
    }

    case "image": {
      const { src, alt = "", width, href, align = "center" } = block.props;
      if (!src) return ""; // Skip broken/empty images
      const hrefAttr = href
        ? ` href="${escapeHtml(interpolate(href, variables))}"`
        : "";
      return `
        <mj-section padding="0">
          <mj-column>
            <mj-image src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${width ? ` width="${width}px"` : ""} align="${align}"${hrefAttr} padding="8px 24px" />
          </mj-column>
        </mj-section>`;
    }

    case "button": {
      const {
        text,
        href,
        bgColor = "#000000",
        textColor = "#FFFFFF",
        borderRadius = 4,
        align = "center",
        fullWidth = false,
      } = block.props;
      return `
        <mj-section padding="0">
          <mj-column>
            <mj-button href="${escapeHtml(interpolate(href, variables))}" background-color="${bgColor}" color="${textColor}" border-radius="${borderRadius}px" align="${align}" font-size="14px" font-weight="bold" font-family="Arial, sans-serif" padding="16px 24px"${fullWidth ? ' width="100%"' : ""}>
              ${escapeHtml(interpolate(text, variables))}
            </mj-button>
          </mj-column>
        </mj-section>`;
    }

    case "divider": {
      const { color = "#E5E7EB", thickness = 1, margin = 16 } = block.props;
      return `
        <mj-section padding="0">
          <mj-column>
            <mj-divider border-color="${color}" border-width="${thickness}px" padding="${margin}px 24px" />
          </mj-column>
        </mj-section>`;
    }

    case "spacer": {
      const { height } = block.props;
      return `
        <mj-section padding="0">
          <mj-column>
            <mj-spacer height="${height}px" />
          </mj-column>
        </mj-section>`;
    }

    case "product": {
      const {
        productId,
        showPrice = true,
        showDescription = true,
        showImage = true,
        buttonText = "Shop Now",
        buttonHref = "#",
        source,
      } = block.props;

      // For dynamic sources, try dynamicProducts first, then fall back to products map
      let product: ProductData | undefined;
      if (source && source !== "manual" && options.dynamicProducts?.length) {
        product = options.dynamicProducts[0];
      } else {
        product = products?.[productId];
      }

      if (!product) {
        return options.previewMode
          ? `
          <mj-section padding="16px 24px">
            <mj-column>
              <mj-text align="center" color="#999" font-family="Arial, sans-serif">[Product placeholder]</mj-text>
            </mj-column>
          </mj-section>`
          : "";
      }

      const imageColumn =
        showImage && product.imageUrl
          ? `
            <mj-column width="40%" padding-right="16px">
              <mj-image src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" border-radius="4px" />
            </mj-column>`
          : "";

      const priceHtml = showPrice
        ? `<p style="font-size: 16px; font-weight: bold; margin: 0 0 16px; color: #111;">
            ${formatPrice(product.price)}
            ${product.compareAtPrice ? `<span style="text-decoration: line-through; color: #999; font-weight: normal; margin-left: 8px;">${formatPrice(product.compareAtPrice)}</span>` : ""}
          </p>`
        : "";

      const descHtml =
        showDescription && product.description
          ? `<p style="font-size: 14px; color: #666; margin: 0 0 12px; line-height: 1.5;">${escapeHtml(product.description)}</p>`
          : "";

      const textColumnWidth = showImage && product.imageUrl ? '60%' : '100%';

      return `
        <mj-section padding="16px 24px">
          ${imageColumn}
          <mj-column width="${textColumnWidth}">
            <mj-text font-family="Arial, sans-serif" padding="0">
              <p style="font-size: 18px; font-weight: bold; margin: 0 0 8px; color: #111;">${escapeHtml(product.title)}</p>
              ${descHtml}
              ${priceHtml}
            </mj-text>
            <mj-button href="${escapeHtml(interpolate(buttonHref || "#", variables))}" background-color="#000" color="#fff" font-size="13px" font-weight="bold" border-radius="4px" align="left" padding="0">
              ${escapeHtml(buttonText)}
            </mj-button>
          </mj-column>
        </mj-section>`;
    }

    case "product_grid": {
      const {
        productIds,
        columns = 2,
        showPrice = true,
        showDescription = false,
        source: gridSource,
        dynamicProductCount,
      } = block.props;

      // For dynamic grids, use dynamicProducts instead of productIds
      let effectiveProductIds = productIds;
      if (
        gridSource &&
        gridSource !== "manual" &&
        dynamicProductCount &&
        options.dynamicProducts?.length
      ) {
        effectiveProductIds = options.dynamicProducts
          .slice(0, dynamicProductCount)
          .map((p) => p.id);
        // Inject dynamic products into the products map for rendering
        for (const dp of options.dynamicProducts) {
          if (!products?.[dp.id]) {
            if (!options.products)
              (options as { products: Record<string, ProductData> }).products =
                {};
            options.products![dp.id] = dp;
          }
        }
      }

      // Build rows of products, each row is an mj-section with columns
      const rows: string[] = [];
      for (let i = 0; i < effectiveProductIds.length; i += columns) {
        const rowIds = effectiveProductIds.slice(i, i + columns);
        const columnMarkup = rowIds.map((pid) => {
          const product = options.products?.[pid];
          if (!product) {
            return `<mj-column></mj-column>`;
          }
          return `
            <mj-column padding="8px">
              ${product.imageUrl ? `<mj-image src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" border-radius="4px" padding-bottom="8px" />` : ""}
              <mj-text font-family="Arial, sans-serif" padding="0">
                <p style="font-size: 14px; font-weight: bold; margin: 0 0 4px; color: #111;">${escapeHtml(product.title)}</p>
                ${showDescription && product.description ? `<p style="font-size: 12px; color: #666; margin: 0 0 4px;">${escapeHtml(product.description)}</p>` : ""}
                ${showPrice ? `<p style="font-size: 14px; font-weight: bold; margin: 0; color: #111;">${formatPrice(product.price)}</p>` : ""}
              </mj-text>
            </mj-column>`;
        });

        // Pad with empty columns if the last row is incomplete
        while (columnMarkup.length < columns) {
          columnMarkup.push(`<mj-column></mj-column>`);
        }

        rows.push(`
          <mj-section padding="8px 16px">
            ${columnMarkup.join("")}
          </mj-section>`);
      }

      return rows.join("\n");
    }

    case "columns": {
      const { columns, columnWidths } = block.props;
      const defaultWidth = Math.floor(100 / columns.length);
      const columnMarkup = columns
        .map((colBlocks, i) => {
          const width = columnWidths?.[i] ?? defaultWidth;
          // Since MJML doesn't allow mj-section inside mj-column, render inner content directly
          const innerContent = colBlocks
            .map((b) => renderBlockInnerMjml(b, options))
            .join("");
          return `
            <mj-column width="${width}%">
              ${innerContent}
            </mj-column>`;
        })
        .join("");

      return `
        <mj-section padding="0 24px">
          ${columnMarkup}
        </mj-section>`;
    }

    case "social": {
      const { links } = block.props;
      if (links.length === 0) return "";
      const elements = links
        .map(
          (link) =>
            `<mj-social-element name="${escapeHtml(link.platform)}" href="${escapeHtml(link.url)}">${escapeHtml(link.platform)}</mj-social-element>`
        )
        .join("\n              ");
      return `
        <mj-section padding="0">
          <mj-column>
            <mj-social font-size="13px" icon-size="24px" mode="horizontal" padding="16px 24px">
              ${elements}
            </mj-social>
          </mj-column>
        </mj-section>`;
    }

    case "header": {
      const {
        logoSrc,
        logoAlt = "",
        bgColor = "#FFFFFF",
        align = "center",
      } = block.props;
      return `
        <mj-section background-color="${bgColor}" padding="24px">
          <mj-column>
            ${logoSrc ? `<mj-image src="${escapeHtml(logoSrc)}" alt="${escapeHtml(logoAlt)}" align="${align}" width="150px" padding="0" />` : ""}
          </mj-column>
        </mj-section>`;
    }

    case "footer": {
      const { text, unsubscribeText = "Unsubscribe" } = block.props;
      const unsubUrl = variables.unsubscribe_url ?? "#";
      return `
        <mj-section padding="24px">
          <mj-column>
            <mj-text align="center" font-size="12px" color="#999" font-family="Arial, sans-serif" line-height="1.5" padding="0 0 8px 0">
              <p style="margin: 0;">${interpolate(text, variables)}</p>
            </mj-text>
            <mj-text align="center" font-size="12px" padding="0">
              <a href="${escapeHtml(unsubUrl)}" style="color: #999; text-decoration: underline;">${escapeHtml(unsubscribeText)}</a>
            </mj-text>
          </mj-column>
        </mj-section>`;
    }

    case "hero": {
      const {
        heading,
        subtext,
        buttonText,
        buttonHref,
        bgColor = "#000000",
        textColor = "#FFFFFF",
        align = "center",
        bgImageSrc,
      } = block.props;

      const bgImageAttr = bgImageSrc
        ? ` background-url="${escapeHtml(bgImageSrc)}" background-size="cover" background-position="center"`
        : "";

      return `
        <mj-hero mode="fluid-height" background-color="${bgColor}"${bgImageAttr} padding="48px 32px">
          <mj-text align="${align}" color="${textColor}" font-family="Arial, sans-serif" font-size="32px" font-weight="bold" line-height="1.2" padding="0 0 12px 0">
            ${escapeHtml(interpolate(heading, variables))}
          </mj-text>
          ${subtext ? `<mj-text align="${align}" color="${textColor}" font-family="Arial, sans-serif" font-size="16px" line-height="1.5" padding="0 0 24px 0" css-class="hero-subtext"><span style="opacity: 0.85;">${escapeHtml(interpolate(subtext, variables))}</span></mj-text>` : ""}
          ${buttonText && buttonHref ? `<mj-button href="${escapeHtml(interpolate(buttonHref, variables))}" background-color="${textColor}" color="${bgColor}" font-size="14px" font-weight="bold" border-radius="6px" align="${align}">${escapeHtml(interpolate(buttonText, variables))}</mj-button>` : ""}
        </mj-hero>`;
    }

    case "icon_row": {
      const { items } = block.props;
      const columnMarkup = items
        .map(
          (item) => `
            <mj-column padding="16px 8px">
              <mj-text align="center" font-family="Arial, sans-serif" padding="0">
                <div style="font-size: 28px; line-height: 1; margin-bottom: 8px;">${escapeHtml(item.icon)}</div>
                <p style="margin: 0; font-size: 13px; font-weight: bold; color: #333;">${escapeHtml(item.label)}</p>
                ${item.description ? `<p style="margin: 4px 0 0; font-size: 11px; color: #999;">${escapeHtml(item.description)}</p>` : ""}
              </mj-text>
            </mj-column>`
        )
        .join("");

      return `
        <mj-section padding="8px 24px">
          ${columnMarkup}
        </mj-section>`;
    }

    case "countdown": {
      const {
        endDate,
        label,
        bgColor = "#FF0000",
        textColor = "#FFFFFF",
      } = block.props;
      const end = new Date(endDate);
      const now = new Date();
      const diffMs = Math.max(0, end.getTime() - now.getTime());
      const days = Math.ceil(diffMs / 86400000);
      const displayText =
        days > 0 ? `${days} day${days !== 1 ? "s" : ""} left` : "Ending soon!";

      return `
        <mj-section background-color="${bgColor}" padding="20px 24px">
          <mj-column>
            <mj-text align="center" color="${textColor}" font-family="Arial, sans-serif" font-size="13px" padding="0 0 4px 0" css-class="countdown-label">
              <span style="text-transform: uppercase; letter-spacing: 1px; opacity: 0.85;">${escapeHtml(interpolate(label, variables))}</span>
            </mj-text>
            <mj-text align="center" color="${textColor}" font-family="Arial, sans-serif" font-size="28px" font-weight="bold" padding="0">
              ${displayText}
            </mj-text>
          </mj-column>
        </mj-section>`;
    }

    case "testimonial": {
      const { quote, author, rating, avatarUrl } = block.props;
      const stars = rating
        ? "&#9733;".repeat(Math.min(rating, 5)) +
          "&#9734;".repeat(Math.max(0, 5 - rating))
        : "";

      const avatarHtml = avatarUrl
        ? `<img src="${escapeHtml(avatarUrl)}" alt="" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 8px; vertical-align: middle;" />`
        : "";

      return `
        <mj-section padding="24px 32px">
          <mj-column>
            <mj-text font-family="Arial, sans-serif" padding="0">
              <div style="background-color: #F9FAFB; border-radius: 12px; padding: 24px; border-left: 4px solid #E5E7EB;">
                ${stars ? `<p style="margin: 0 0 8px; font-size: 18px; color: #F59E0B; letter-spacing: 2px;">${stars}</p>` : ""}
                <p style="margin: 0 0 12px; font-size: 15px; font-style: italic; color: #374151; line-height: 1.6;">"${escapeHtml(interpolate(quote, variables))}"</p>
                <div>
                  ${avatarHtml}
                  <span style="font-size: 13px; font-weight: bold; color: #6B7280; vertical-align: middle;">&#8212; ${escapeHtml(author)}</span>
                </div>
              </div>
            </mj-text>
          </mj-column>
        </mj-section>`;
    }

    default:
      return "";
  }
}

/**
 * Render a block's inner content (without wrapping mj-section) for use inside mj-column.
 * Used for nested blocks inside columns.
 */
function renderBlockInnerMjml(
  block: EmailBlock,
  options: RenderOptions
): string {
  const { variables } = options;

  switch (block.type) {
    case "text": {
      const {
        html,
        align = "left",
        fontSize = 16,
        color = "#333333",
        fontFamily = "Arial, sans-serif",
      } = block.props;
      const content = interpolate(html, variables);
      return `<mj-text align="${align}" font-size="${fontSize}px" color="${color}" font-family="${fontFamily}" line-height="1.6" padding="8px 0">${content}</mj-text>`;
    }

    case "image": {
      const { src, alt = "", width, href, align = "center" } = block.props;
      if (!src) return ""; // Skip broken/empty images
      const hrefAttr = href
        ? ` href="${escapeHtml(interpolate(href, variables))}"`
        : "";
      return `<mj-image src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${width ? ` width="${width}px"` : ""} align="${align}"${hrefAttr} padding="8px 0" />`;
    }

    case "button": {
      const {
        text,
        href,
        bgColor = "#000000",
        textColor = "#FFFFFF",
        borderRadius = 4,
        align = "center",
        fullWidth = false,
      } = block.props;
      return `<mj-button href="${escapeHtml(interpolate(href, variables))}" background-color="${bgColor}" color="${textColor}" border-radius="${borderRadius}px" align="${align}" font-size="14px" font-weight="bold" font-family="Arial, sans-serif" padding="8px 0"${fullWidth ? ' width="100%"' : ""}>${escapeHtml(interpolate(text, variables))}</mj-button>`;
    }

    case "divider": {
      const { color = "#E5E7EB", thickness = 1, margin = 16 } = block.props;
      return `<mj-divider border-color="${color}" border-width="${thickness}px" padding="${margin}px 0" />`;
    }

    case "spacer": {
      const { height } = block.props;
      return `<mj-spacer height="${height}px" />`;
    }

    default:
      // For complex block types inside columns, fall back to text rendering
      return "";
  }
}

// ============================================================================
// UTM Injection (preserved from original, applied AFTER MJML compilation)
// ============================================================================

/** Inject UTM params into all <a href> URLs matching the store domain */
function injectUtmParams(html: string, options: RenderOptions): string {
  const { tracking } = options;
  if (!tracking) return html;

  return html.replace(/href="([^"]+)"/g, (_match, url: string) => {
    // Skip unsubscribe, mailto, anchor-only links
    if (
      url.startsWith("mailto:") ||
      url.startsWith("#") ||
      url.includes("unsubscribe")
    ) {
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
      ...(tracking.utmContent
        ? [`utm_content=${encodeURIComponent(tracking.utmContent)}`]
        : []),
    ].join("&");
    return `href="${url}${separator}${params}"`;
  });
}

// ============================================================================
// Main render function
// ============================================================================

/** Render an array of email blocks to a complete HTML email string via MJML */
export function renderToHtml(
  blocks: EmailBlock[],
  options: RenderOptions
): string {
  let finalBlocks = [...blocks];

  // Auto-inject header if brandSettings has a logo but blocks don't start with header
  if (
    options.brandSettings?.logoUrl &&
    finalBlocks[0]?.type !== "header"
  ) {
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
  if (
    options.brandSettings &&
    finalBlocks[finalBlocks.length - 1]?.type !== "footer"
  ) {
    const bs = options.brandSettings;
    const footerParts: string[] = [];
    if (bs.showAddress !== false && bs.address)
      footerParts.push(`${bs.storeName ?? ""} · ${bs.address}`);
    if (bs.showSocialLinks !== false && bs.socialLinks?.length) {
      footerParts.push(bs.socialLinks.map((l) => l.platform).join(" · "));
    }
    if (bs.footerText) footerParts.push(bs.footerText);
    if (footerParts.length === 0 && bs.storeName)
      footerParts.push(bs.storeName);

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

  // Build block MJML markup
  const blockMjml = finalBlocks
    .map((block) => renderBlockToMjml(block, options))
    .join("\n");

  // Compose full MJML document
  const mjmlString = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" />
      <mj-text color="#333333" />
      <mj-body background-color="#F5F5F5" />
    </mj-attributes>
    <mj-style>
      .email-container { max-width: 600px; }
    </mj-style>
    <mj-breakpoint width="600px" />
  </mj-head>
  <mj-body background-color="#F5F5F5" width="600px">
    <mj-wrapper background-color="#FFFFFF" border-radius="8px" padding="0">
      ${blockMjml}
    </mj-wrapper>
  </mj-body>
</mjml>`;

  // Compile MJML to HTML
  const { html, errors } = mjml2html(mjmlString, {
    validationLevel: "soft",
    minify: false,
  });

  // MJML validation errors are non-fatal; we silently ignore them.
  // The compiled HTML is still usable even with soft validation warnings.
  void errors;

  // Apply UTM injection on the compiled HTML
  return injectUtmParams(html, options);
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
export function renderFromArchetype(
  _options: ArchetypeRenderOptions
): string | null {
  // Consumers should use @allohq/creative-engine.renderMjmlTemplate() directly.
  // This stub exists to maintain the API surface in email-builder.
  return null;
}
