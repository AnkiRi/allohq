import * as React from "react";
import {
  Button,
  Column,
  Heading,
  Hr,
  Img,
  Link,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type {
  EmailBlock,
  ProductData,
} from "@allohq/email-builder";
import type { BrandKit } from "../brand-kit";
import { formatINR } from "../brand-kit";

// ---------------------------------------------------------------------------
// Render context — everything a block needs that isn't the brand kit.
// ---------------------------------------------------------------------------

export interface BlockRenderContext {
  brandKit: BrandKit;
  /** Merge tags, e.g. { first_name: "Aanya", unsubscribe_url: "..." }. */
  variables: Record<string, string>;
  /** Product data keyed by product id. */
  products: Record<string, ProductData>;
  /** Dynamic recommendations resolved at send time. */
  dynamicProducts?: ProductData[];
  /** Show placeholders for missing data (editor preview). */
  previewMode?: boolean;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/** Interpolate merge tags like {{first_name}}. */
function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w[\w.]*)\}\}/g, (_m, key: string) =>
    variables[key] ?? `{{${key}}}`,
  );
}

/** Strip HTML tags down to plain text (AI sometimes emits <p>...</p>). */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function alignToText(align?: string): "left" | "center" | "right" {
  return align === "center" || align === "right" ? align : "left";
}

// ---------------------------------------------------------------------------
// Block renderers
// ---------------------------------------------------------------------------

function HeroBlockView({
  block,
  ctx,
}: {
  block: Extract<EmailBlock, { type: "hero" }>;
  ctx: BlockRenderContext;
}) {
  const { brandKit: bk, variables } = ctx;
  const { heading, subtext, buttonText, buttonHref, bgImageSrc, align } = block.props;
  const ta = alignToText(align);

  return (
    <Section
      className="bk-accent bk-pad"
      style={{
        backgroundColor: bk.colors.accent,
        backgroundImage: bgImageSrc ? `url(${bgImageSrc})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        padding: "44px 36px 38px",
      }}
    >
      <Heading
        as="h1"
        className="bk-h1 bk-ink"
        style={{
          margin: 0,
          fontFamily: bk.fonts.serif,
          fontSize: 32,
          lineHeight: "38px",
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: bgImageSrc ? bk.colors.onPrimary : bk.colors.ink,
          textAlign: ta,
        }}
      >
        {interpolate(heading, variables)}
      </Heading>
      {subtext ? (
        <Text
          className="bk-body"
          style={{
            margin: "14px 0 0",
            fontFamily: bk.fonts.sans,
            fontSize: 16,
            lineHeight: "26px",
            color: bgImageSrc ? bk.colors.onPrimaryMuted : bk.colors.body,
            textAlign: ta,
          }}
        >
          {interpolate(subtext, variables)}
        </Text>
      ) : null}
      {buttonText && buttonHref ? (
        <div style={{ marginTop: 24, textAlign: ta }}>
          <PrimaryButton bk={bk} href={interpolate(buttonHref, variables)}>
            {interpolate(buttonText, variables)}
          </PrimaryButton>
        </div>
      ) : null}
    </Section>
  );
}

function PrimaryButton({
  bk,
  href,
  children,
}: {
  bk: BrandKit;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: bk.colors.primary,
        color: bk.colors.onPrimary,
        fontFamily: bk.fonts.sans,
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: "0.01em",
        textDecoration: "none",
        borderRadius: bk.radius.button,
        padding: "14px 26px",
        display: "inline-block",
      }}
    >
      {children}
    </Button>
  );
}

function TextBlockView({
  block,
  ctx,
}: {
  block: Extract<EmailBlock, { type: "text" }>;
  ctx: BlockRenderContext;
}) {
  const { brandKit: bk, variables } = ctx;
  const content = stripHtml(interpolate(block.props.html, variables));
  const paragraphs = content.split(/\n\n+/).filter(Boolean);
  const ta = alignToText(block.props.align);

  return (
    <Section className="bk-pad" style={{ padding: "20px 36px 0" }}>
      {paragraphs.map((p, i) => (
        <Text
          key={i}
          className="bk-body"
          style={{
            margin: i === 0 ? "0 0 16px" : "0 0 16px",
            fontFamily: bk.fonts.sans,
            fontSize: block.props.fontSize ?? 16,
            lineHeight: "26px",
            color: bk.colors.body,
            textAlign: ta,
            whiteSpace: "pre-line",
          }}
        >
          {p}
        </Text>
      ))}
    </Section>
  );
}

function ImageBlockView({
  block,
  ctx,
}: {
  block: Extract<EmailBlock, { type: "image" }>;
  ctx: BlockRenderContext;
}) {
  const { variables } = ctx;
  const { src, alt = "", width, href, align } = block.props;
  if (!src) return null;
  const ta = alignToText(align ?? "center");
  const img = (
    <Img
      src={src}
      alt={alt}
      width={width}
      style={{ display: "block", maxWidth: "100%", margin: ta === "center" ? "0 auto" : 0 }}
    />
  );
  return (
    <Section className="bk-pad" style={{ padding: "20px 36px 0" }}>
      {href ? <Link href={interpolate(href, variables)}>{img}</Link> : img}
    </Section>
  );
}

function ButtonBlockView({
  block,
  ctx,
}: {
  block: Extract<EmailBlock, { type: "button" }>;
  ctx: BlockRenderContext;
}) {
  const { brandKit: bk, variables } = ctx;
  const ta = alignToText(block.props.align ?? "left");
  return (
    <Section className="bk-pad" style={{ padding: "24px 36px 0", textAlign: ta }}>
      <PrimaryButton bk={bk} href={interpolate(block.props.href || "#", variables)}>
        {interpolate(block.props.text, variables)}
      </PrimaryButton>
    </Section>
  );
}

function DividerBlockView({ ctx }: { ctx: BlockRenderContext }) {
  const { brandKit: bk } = ctx;
  return (
    <Section className="bk-pad" style={{ padding: "20px 36px 0" }}>
      <Hr
        className="bk-line"
        style={{
          borderColor: bk.colors.line,
          borderTop: `1px solid ${bk.colors.line}`,
          margin: 0,
        }}
      />
    </Section>
  );
}

function SpacerBlockView({
  block,
}: {
  block: Extract<EmailBlock, { type: "spacer" }>;
}) {
  return <Section style={{ height: block.props.height, lineHeight: `${block.props.height}px` }}>&nbsp;</Section>;
}

function resolveProduct(
  block: Extract<EmailBlock, { type: "product" }>,
  ctx: BlockRenderContext,
): ProductData | undefined {
  const { source, productId } = block.props;
  if (source && source !== "manual" && ctx.dynamicProducts?.length) {
    return ctx.dynamicProducts[0];
  }
  const fromMap = ctx.products[productId];
  if (fromMap) return fromMap;
  // Fall back to inline-resolved props on the block.
  if (block.props.title) {
    return {
      id: productId,
      title: block.props.title,
      description: block.props.description,
      imageUrl: block.props.imageUrl,
      price: block.props.price ?? 0,
      handle: undefined,
    };
  }
  return undefined;
}

function ProductBlockView({
  block,
  ctx,
}: {
  block: Extract<EmailBlock, { type: "product" }>;
  ctx: BlockRenderContext;
}) {
  const { brandKit: bk, variables } = ctx;
  const product = resolveProduct(block, ctx);
  if (!product) {
    return ctx.previewMode ? (
      <Section className="bk-pad" style={{ padding: "20px 36px 0" }}>
        <Text style={{ textAlign: "center", color: bk.colors.muted, fontFamily: bk.fonts.sans }}>
          [Product placeholder]
        </Text>
      </Section>
    ) : null;
  }

  const {
    showPrice = true,
    showImage = true,
    showDescription = true,
    buttonText = "Shop now",
    buttonHref = "#",
  } = block.props;
  const hasImage = showImage && !!product.imageUrl;

  return (
    <Section className="bk-pad" style={{ padding: "20px 36px 0" }}>
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        className="bk-line"
        style={{
          borderCollapse: "separate",
          border: `1px solid ${bk.colors.line}`,
          borderRadius: bk.radius.card,
          overflow: "hidden",
          backgroundColor: bk.colors.paper,
        }}
      >
        <tr>
          {hasImage ? (
            <td width={140} valign="top" className="bk-stack" style={{ padding: 0 }}>
              <Img
                src={product.imageUrl}
                alt={product.title}
                width={140}
                className="bk-stack-img"
                style={{ display: "block", width: 140, height: "auto" }}
              />
            </td>
          ) : null}
          <td valign="middle" className="bk-stack" style={{ padding: "18px 20px" }}>
            <Text
              className="bk-ink"
              style={{
                margin: "0 0 6px",
                fontFamily: bk.fonts.serif,
                fontSize: 19,
                lineHeight: "24px",
                color: bk.colors.ink,
              }}
            >
              {product.title}
            </Text>
            {showDescription && product.description ? (
              <Text
                className="bk-body"
                style={{
                  margin: "0 0 10px",
                  fontFamily: bk.fonts.sans,
                  fontSize: 14,
                  lineHeight: "21px",
                  color: bk.colors.body,
                }}
              >
                {product.description}
              </Text>
            ) : null}
            {showPrice ? (
              <Text
                className="bk-ink"
                style={{
                  margin: "0 0 12px",
                  fontFamily: bk.fonts.sans,
                  fontSize: 15,
                  fontWeight: 600,
                  color: bk.colors.ink,
                }}
              >
                {formatINR(product.price)}
                {product.compareAtPrice ? (
                  <span
                    className="bk-muted"
                    style={{
                      fontWeight: 400,
                      fontSize: 13,
                      color: bk.colors.muted,
                      textDecoration: "line-through",
                      marginLeft: 8,
                    }}
                  >
                    {formatINR(product.compareAtPrice)}
                  </span>
                ) : null}
              </Text>
            ) : null}
            <PrimaryButton bk={bk} href={interpolate(buttonHref || "#", variables)}>
              {buttonText}
            </PrimaryButton>
          </td>
        </tr>
      </table>
    </Section>
  );
}

function ProductGridBlockView({
  block,
  ctx,
}: {
  block: Extract<EmailBlock, { type: "product_grid" }>;
  ctx: BlockRenderContext;
}) {
  const { brandKit: bk } = ctx;
  const { columns = 2, showPrice = true, showDescription = false } = block.props;

  let ids = block.props.productIds;
  if (
    block.props.source &&
    block.props.source !== "manual" &&
    block.props.dynamicProductCount &&
    ctx.dynamicProducts?.length
  ) {
    ids = ctx.dynamicProducts.slice(0, block.props.dynamicProductCount).map((p) => p.id);
    for (const dp of ctx.dynamicProducts) {
      if (!ctx.products[dp.id]) ctx.products[dp.id] = dp;
    }
  }

  const items = ids.map((id) => ctx.products[id]).filter((p): p is ProductData => !!p);
  if (items.length === 0) return null;

  const rows: ProductData[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }

  return (
    <Section className="bk-pad" style={{ padding: "20px 36px 0" }}>
      {rows.map((row, ri) => (
        <Row key={ri}>
          {row.map((p) => (
            <Column key={p.id} className="bk-stack" valign="top" style={{ padding: 8 }}>
              {p.imageUrl ? (
                <Img
                  src={p.imageUrl}
                  alt={p.title}
                  className="bk-stack-img"
                  style={{ display: "block", width: "100%", height: "auto", borderRadius: 8 }}
                />
              ) : null}
              <Text
                className="bk-ink"
                style={{
                  margin: "8px 0 2px",
                  fontFamily: bk.fonts.sans,
                  fontSize: 14,
                  fontWeight: 600,
                  color: bk.colors.ink,
                }}
              >
                {p.title}
              </Text>
              {showDescription && p.description ? (
                <Text
                  className="bk-muted"
                  style={{ margin: "0 0 2px", fontFamily: bk.fonts.sans, fontSize: 12, color: bk.colors.muted }}
                >
                  {p.description}
                </Text>
              ) : null}
              {showPrice ? (
                <Text
                  className="bk-ink"
                  style={{ margin: 0, fontFamily: bk.fonts.sans, fontSize: 14, fontWeight: 600, color: bk.colors.ink }}
                >
                  {formatINR(p.price)}
                </Text>
              ) : null}
            </Column>
          ))}
        </Row>
      ))}
    </Section>
  );
}

function IconRowBlockView({
  block,
  ctx,
}: {
  block: Extract<EmailBlock, { type: "icon_row" }>;
  ctx: BlockRenderContext;
}) {
  const { brandKit: bk } = ctx;
  return (
    <Section className="bk-pad" style={{ padding: "24px 36px 0" }}>
      <Row>
        {block.props.items.map((item, i) => (
          <Column key={i} className="bk-stack" valign="top" style={{ padding: "0 8px", textAlign: "center" }}>
            {item.icon ? (
              <Text style={{ margin: "0 0 6px", fontSize: 22, lineHeight: "24px", textAlign: "center" }}>
                {item.icon}
              </Text>
            ) : null}
            <Text
              className="bk-ink"
              style={{
                margin: 0,
                fontFamily: bk.fonts.sans,
                fontSize: 13,
                fontWeight: 600,
                color: bk.colors.ink,
                textAlign: "center",
              }}
            >
              {item.label}
            </Text>
            {item.description ? (
              <Text
                className="bk-muted"
                style={{ margin: "4px 0 0", fontFamily: bk.fonts.sans, fontSize: 12, color: bk.colors.muted, textAlign: "center" }}
              >
                {item.description}
              </Text>
            ) : null}
          </Column>
        ))}
      </Row>
    </Section>
  );
}

function TestimonialBlockView({
  block,
  ctx,
}: {
  block: Extract<EmailBlock, { type: "testimonial" }>;
  ctx: BlockRenderContext;
}) {
  const { brandKit: bk, variables } = ctx;
  const { quote, author, rating } = block.props;
  const stars = rating ? "★".repeat(Math.min(rating, 5)) : "";
  return (
    <Section className="bk-pad" style={{ padding: "24px 36px 0" }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tr>
          <td
            className="bk-accent"
            style={{
              backgroundColor: bk.colors.accent,
              borderRadius: bk.radius.card,
              padding: "22px 24px",
            }}
          >
            {stars ? (
              <Text style={{ margin: "0 0 8px", fontSize: 15, letterSpacing: "2px", color: bk.colors.primary }}>
                {stars}
              </Text>
            ) : null}
            <Text
              className="bk-body"
              style={{
                margin: "0 0 12px",
                fontFamily: bk.fonts.serif,
                fontSize: 17,
                lineHeight: "26px",
                fontStyle: "italic",
                color: bk.colors.ink,
              }}
            >
              &ldquo;{interpolate(quote, variables)}&rdquo;
            </Text>
            <Text
              className="bk-muted"
              style={{ margin: 0, fontFamily: bk.fonts.sans, fontSize: 13, fontWeight: 600, color: bk.colors.muted }}
            >
              {"— "}
              {author}
            </Text>
          </td>
        </tr>
      </table>
    </Section>
  );
}

function CountdownBlockView({
  block,
  ctx,
}: {
  block: Extract<EmailBlock, { type: "countdown" }>;
  ctx: BlockRenderContext;
}) {
  const { brandKit: bk, variables } = ctx;
  const end = new Date(block.props.endDate);
  const diff = Math.max(0, end.getTime() - Date.now());
  const days = Math.ceil(diff / 86400000);
  const display = days > 0 ? `${days} day${days !== 1 ? "s" : ""} left` : "Ending soon";
  return (
    <Section className="bk-pad" style={{ padding: "24px 36px 0" }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tr>
          <td
            style={{
              backgroundColor: bk.colors.primary,
              borderRadius: bk.radius.card,
              padding: "20px 24px",
              textAlign: "center",
            }}
          >
            <Text
              style={{
                margin: "0 0 4px",
                fontFamily: bk.fonts.sans,
                fontSize: 12,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: bk.colors.onPrimaryMuted,
                textAlign: "center",
              }}
            >
              {interpolate(block.props.label, variables)}
            </Text>
            <Text
              style={{
                margin: 0,
                fontFamily: bk.fonts.serif,
                fontSize: 26,
                fontWeight: 600,
                color: bk.colors.onPrimary,
                textAlign: "center",
              }}
            >
              {display}
            </Text>
          </td>
        </tr>
      </table>
    </Section>
  );
}

function SocialBlockView({
  block,
  ctx,
}: {
  block: Extract<EmailBlock, { type: "social" }>;
  ctx: BlockRenderContext;
}) {
  const { brandKit: bk } = ctx;
  if (block.props.links.length === 0) return null;
  return (
    <Section className="bk-pad" style={{ padding: "20px 36px 0", textAlign: "center" }}>
      <Text style={{ margin: 0, fontFamily: bk.fonts.sans, fontSize: 13, color: bk.colors.muted, textAlign: "center" }}>
        {block.props.links.map((l, i) => (
          <React.Fragment key={l.platform}>
            {i > 0 ? "  ·  " : ""}
            <Link href={l.url} style={{ color: bk.colors.secondary }}>
              {l.platform}
            </Link>
          </React.Fragment>
        ))}
      </Text>
    </Section>
  );
}

/**
 * `header` and `footer` content blocks from the content model are intentionally
 * NOT rendered here — the BrandEmailLayout shell owns the brand header and footer
 * so every email gets one consistent, on-brand chrome. Dropping these avoids a
 * duplicate logo / double footer.
 */
function isChromeBlock(block: EmailBlock): boolean {
  return block.type === "header" || block.type === "footer";
}

export function renderBlock(block: EmailBlock, ctx: BlockRenderContext): React.ReactNode {
  if (isChromeBlock(block)) return null;
  switch (block.type) {
    case "hero":
      return <HeroBlockView block={block} ctx={ctx} />;
    case "text":
      return <TextBlockView block={block} ctx={ctx} />;
    case "image":
      return <ImageBlockView block={block} ctx={ctx} />;
    case "button":
      return <ButtonBlockView block={block} ctx={ctx} />;
    case "divider":
      return <DividerBlockView ctx={ctx} />;
    case "spacer":
      return <SpacerBlockView block={block} />;
    case "product":
      return <ProductBlockView block={block} ctx={ctx} />;
    case "product_grid":
      return <ProductGridBlockView block={block} ctx={ctx} />;
    case "icon_row":
      return <IconRowBlockView block={block} ctx={ctx} />;
    case "testimonial":
      return <TestimonialBlockView block={block} ctx={ctx} />;
    case "countdown":
      return <CountdownBlockView block={block} ctx={ctx} />;
    case "social":
      return <SocialBlockView block={block} ctx={ctx} />;
    case "columns":
      // Columns of arbitrary blocks render their children stacked (mobile-first).
      return (
        <>
          {block.props.columns.flat().map((b, i) => (
            <React.Fragment key={b.id ?? i}>{renderBlock(b, ctx)}</React.Fragment>
          ))}
        </>
      );
    default:
      return null;
  }
}
