"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderBlock = renderBlock;
const jsx_runtime_1 = require("react/jsx-runtime");
const React = __importStar(require("react"));
const components_1 = require("@react-email/components");
const brand_kit_1 = require("../brand-kit");
// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
/** Interpolate merge tags like {{first_name}}. */
function interpolate(text, variables) {
    return text.replace(/\{\{(\w[\w.]*)\}\}/g, (_m, key) => variables[key] ?? `{{${key}}}`);
}
/** Strip HTML tags down to plain text (AI sometimes emits <p>...</p>). */
function stripHtml(html) {
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
function alignToText(align) {
    return align === "center" || align === "right" ? align : "left";
}
// ---------------------------------------------------------------------------
// Block renderers
// ---------------------------------------------------------------------------
function HeroBlockView({ block, ctx, }) {
    const { brandKit: bk, variables } = ctx;
    const { heading, subtext, buttonText, buttonHref, bgImageSrc, align } = block.props;
    const ta = alignToText(align);
    return ((0, jsx_runtime_1.jsxs)(components_1.Section, { className: "bk-accent bk-pad", style: {
            backgroundColor: bk.colors.accent,
            backgroundImage: bgImageSrc ? `url(${bgImageSrc})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            padding: "44px 36px 38px",
        }, children: [(0, jsx_runtime_1.jsx)(components_1.Heading, { as: "h1", className: "bk-h1 bk-ink", style: {
                    margin: 0,
                    fontFamily: bk.fonts.serif,
                    fontSize: 32,
                    lineHeight: "38px",
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    color: bgImageSrc ? bk.colors.onPrimary : bk.colors.ink,
                    textAlign: ta,
                }, children: interpolate(heading, variables) }), subtext ? ((0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-body", style: {
                    margin: "14px 0 0",
                    fontFamily: bk.fonts.sans,
                    fontSize: 16,
                    lineHeight: "26px",
                    color: bgImageSrc ? bk.colors.onPrimaryMuted : bk.colors.body,
                    textAlign: ta,
                }, children: interpolate(subtext, variables) })) : null, buttonText && buttonHref ? ((0, jsx_runtime_1.jsx)("div", { style: { marginTop: 24, textAlign: ta }, children: (0, jsx_runtime_1.jsx)(PrimaryButton, { bk: bk, href: interpolate(buttonHref, variables), children: interpolate(buttonText, variables) }) })) : null] }));
}
function PrimaryButton({ bk, href, children, }) {
    return ((0, jsx_runtime_1.jsx)(components_1.Button, { href: href, style: {
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
        }, children: children }));
}
function TextBlockView({ block, ctx, }) {
    const { brandKit: bk, variables } = ctx;
    const content = stripHtml(interpolate(block.props.html, variables));
    const paragraphs = content.split(/\n\n+/).filter(Boolean);
    const ta = alignToText(block.props.align);
    return ((0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-pad", style: { padding: "20px 36px 0" }, children: paragraphs.map((p, i) => ((0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-body", style: {
                margin: i === 0 ? "0 0 16px" : "0 0 16px",
                fontFamily: bk.fonts.sans,
                fontSize: block.props.fontSize ?? 16,
                lineHeight: "26px",
                color: bk.colors.body,
                textAlign: ta,
                whiteSpace: "pre-line",
            }, children: p }, i))) }));
}
function ImageBlockView({ block, ctx, }) {
    const { variables } = ctx;
    const { src, alt = "", width, href, align } = block.props;
    if (!src)
        return null;
    const ta = alignToText(align ?? "center");
    const img = ((0, jsx_runtime_1.jsx)(components_1.Img, { src: src, alt: alt, width: width, style: { display: "block", maxWidth: "100%", margin: ta === "center" ? "0 auto" : 0 } }));
    return ((0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-pad", style: { padding: "20px 36px 0" }, children: href ? (0, jsx_runtime_1.jsx)(components_1.Link, { href: interpolate(href, variables), children: img }) : img }));
}
function ButtonBlockView({ block, ctx, }) {
    const { brandKit: bk, variables } = ctx;
    const ta = alignToText(block.props.align ?? "left");
    return ((0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-pad", style: { padding: "24px 36px 0", textAlign: ta }, children: (0, jsx_runtime_1.jsx)(PrimaryButton, { bk: bk, href: interpolate(block.props.href || "#", variables), children: interpolate(block.props.text, variables) }) }));
}
function DividerBlockView({ ctx }) {
    const { brandKit: bk } = ctx;
    return ((0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-pad", style: { padding: "20px 36px 0" }, children: (0, jsx_runtime_1.jsx)(components_1.Hr, { className: "bk-line", style: {
                borderColor: bk.colors.line,
                borderTop: `1px solid ${bk.colors.line}`,
                margin: 0,
            } }) }));
}
function SpacerBlockView({ block, }) {
    return (0, jsx_runtime_1.jsx)(components_1.Section, { style: { height: block.props.height, lineHeight: `${block.props.height}px` }, children: "\u00A0" });
}
function resolveProduct(block, ctx) {
    const { source, productId } = block.props;
    if (source && source !== "manual" && ctx.dynamicProducts?.length) {
        return ctx.dynamicProducts[0];
    }
    const fromMap = ctx.products[productId];
    if (fromMap)
        return fromMap;
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
function ProductBlockView({ block, ctx, }) {
    const { brandKit: bk, variables } = ctx;
    const product = resolveProduct(block, ctx);
    if (!product) {
        return ctx.previewMode ? ((0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-pad", style: { padding: "20px 36px 0" }, children: (0, jsx_runtime_1.jsx)(components_1.Text, { style: { textAlign: "center", color: bk.colors.muted, fontFamily: bk.fonts.sans }, children: "[Product placeholder]" }) })) : null;
    }
    const { showPrice = true, showImage = true, showDescription = true, buttonText = "Shop now", buttonHref = "#", } = block.props;
    const hasImage = showImage && !!product.imageUrl;
    return ((0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-pad", style: { padding: "20px 36px 0" }, children: (0, jsx_runtime_1.jsx)("table", { role: "presentation", width: "100%", cellPadding: 0, cellSpacing: 0, className: "bk-line", style: {
                borderCollapse: "separate",
                border: `1px solid ${bk.colors.line}`,
                borderRadius: bk.radius.card,
                overflow: "hidden",
                backgroundColor: bk.colors.paper,
            }, children: (0, jsx_runtime_1.jsxs)("tr", { children: [hasImage ? ((0, jsx_runtime_1.jsx)("td", { width: 140, valign: "top", className: "bk-stack", style: { padding: 0 }, children: (0, jsx_runtime_1.jsx)(components_1.Img, { src: product.imageUrl, alt: product.title, width: 140, className: "bk-stack-img", style: { display: "block", width: 140, height: "auto" } }) })) : null, (0, jsx_runtime_1.jsxs)("td", { valign: "middle", className: "bk-stack", style: { padding: "18px 20px" }, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-ink", style: {
                                    margin: "0 0 6px",
                                    fontFamily: bk.fonts.serif,
                                    fontSize: 19,
                                    lineHeight: "24px",
                                    color: bk.colors.ink,
                                }, children: product.title }), showDescription && product.description ? ((0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-body", style: {
                                    margin: "0 0 10px",
                                    fontFamily: bk.fonts.sans,
                                    fontSize: 14,
                                    lineHeight: "21px",
                                    color: bk.colors.body,
                                }, children: product.description })) : null, showPrice ? ((0, jsx_runtime_1.jsxs)(components_1.Text, { className: "bk-ink", style: {
                                    margin: "0 0 12px",
                                    fontFamily: bk.fonts.sans,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: bk.colors.ink,
                                }, children: [(0, brand_kit_1.formatINR)(product.price), product.compareAtPrice ? ((0, jsx_runtime_1.jsx)("span", { className: "bk-muted", style: {
                                            fontWeight: 400,
                                            fontSize: 13,
                                            color: bk.colors.muted,
                                            textDecoration: "line-through",
                                            marginLeft: 8,
                                        }, children: (0, brand_kit_1.formatINR)(product.compareAtPrice) })) : null] })) : null, (0, jsx_runtime_1.jsx)(PrimaryButton, { bk: bk, href: interpolate(buttonHref || "#", variables), children: buttonText })] })] }) }) }));
}
function ProductGridBlockView({ block, ctx, }) {
    const { brandKit: bk } = ctx;
    const { columns = 2, showPrice = true, showDescription = false } = block.props;
    let ids = block.props.productIds;
    if (block.props.source &&
        block.props.source !== "manual" &&
        block.props.dynamicProductCount &&
        ctx.dynamicProducts?.length) {
        ids = ctx.dynamicProducts.slice(0, block.props.dynamicProductCount).map((p) => p.id);
        for (const dp of ctx.dynamicProducts) {
            if (!ctx.products[dp.id])
                ctx.products[dp.id] = dp;
        }
    }
    const items = ids.map((id) => ctx.products[id]).filter((p) => !!p);
    if (items.length === 0)
        return null;
    const rows = [];
    for (let i = 0; i < items.length; i += columns) {
        rows.push(items.slice(i, i + columns));
    }
    return ((0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-pad", style: { padding: "20px 36px 0" }, children: rows.map((row, ri) => ((0, jsx_runtime_1.jsx)(components_1.Row, { children: row.map((p) => ((0, jsx_runtime_1.jsxs)(components_1.Column, { className: "bk-stack", valign: "top", style: { padding: 8 }, children: [p.imageUrl ? ((0, jsx_runtime_1.jsx)(components_1.Img, { src: p.imageUrl, alt: p.title, className: "bk-stack-img", style: { display: "block", width: "100%", height: "auto", borderRadius: 8 } })) : null, (0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-ink", style: {
                            margin: "8px 0 2px",
                            fontFamily: bk.fonts.sans,
                            fontSize: 14,
                            fontWeight: 600,
                            color: bk.colors.ink,
                        }, children: p.title }), showDescription && p.description ? ((0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-muted", style: { margin: "0 0 2px", fontFamily: bk.fonts.sans, fontSize: 12, color: bk.colors.muted }, children: p.description })) : null, showPrice ? ((0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-ink", style: { margin: 0, fontFamily: bk.fonts.sans, fontSize: 14, fontWeight: 600, color: bk.colors.ink }, children: (0, brand_kit_1.formatINR)(p.price) })) : null] }, p.id))) }, ri))) }));
}
function IconRowBlockView({ block, ctx, }) {
    const { brandKit: bk } = ctx;
    return ((0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-pad", style: { padding: "24px 36px 0" }, children: (0, jsx_runtime_1.jsx)(components_1.Row, { children: block.props.items.map((item, i) => ((0, jsx_runtime_1.jsxs)(components_1.Column, { className: "bk-stack", valign: "top", style: { padding: "0 8px", textAlign: "center" }, children: [item.icon ? ((0, jsx_runtime_1.jsx)(components_1.Text, { style: { margin: "0 0 6px", fontSize: 22, lineHeight: "24px", textAlign: "center" }, children: item.icon })) : null, (0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-ink", style: {
                            margin: 0,
                            fontFamily: bk.fonts.sans,
                            fontSize: 13,
                            fontWeight: 600,
                            color: bk.colors.ink,
                            textAlign: "center",
                        }, children: item.label }), item.description ? ((0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-muted", style: { margin: "4px 0 0", fontFamily: bk.fonts.sans, fontSize: 12, color: bk.colors.muted, textAlign: "center" }, children: item.description })) : null] }, i))) }) }));
}
function TestimonialBlockView({ block, ctx, }) {
    const { brandKit: bk, variables } = ctx;
    const { quote, author, rating } = block.props;
    const stars = rating ? "★".repeat(Math.min(rating, 5)) : "";
    return ((0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-pad", style: { padding: "24px 36px 0" }, children: (0, jsx_runtime_1.jsx)("table", { role: "presentation", width: "100%", cellPadding: 0, cellSpacing: 0, children: (0, jsx_runtime_1.jsx)("tr", { children: (0, jsx_runtime_1.jsxs)("td", { className: "bk-accent", style: {
                        backgroundColor: bk.colors.accent,
                        borderRadius: bk.radius.card,
                        padding: "22px 24px",
                    }, children: [stars ? ((0, jsx_runtime_1.jsx)(components_1.Text, { style: { margin: "0 0 8px", fontSize: 15, letterSpacing: "2px", color: bk.colors.primary }, children: stars })) : null, (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "bk-body", style: {
                                margin: "0 0 12px",
                                fontFamily: bk.fonts.serif,
                                fontSize: 17,
                                lineHeight: "26px",
                                fontStyle: "italic",
                                color: bk.colors.ink,
                            }, children: ["\u201C", interpolate(quote, variables), "\u201D"] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "bk-muted", style: { margin: 0, fontFamily: bk.fonts.sans, fontSize: 13, fontWeight: 600, color: bk.colors.muted }, children: ["— ", author] })] }) }) }) }));
}
function CountdownBlockView({ block, ctx, }) {
    const { brandKit: bk, variables } = ctx;
    const end = new Date(block.props.endDate);
    const diff = Math.max(0, end.getTime() - Date.now());
    const days = Math.ceil(diff / 86400000);
    const display = days > 0 ? `${days} day${days !== 1 ? "s" : ""} left` : "Ending soon";
    return ((0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-pad", style: { padding: "24px 36px 0" }, children: (0, jsx_runtime_1.jsx)("table", { role: "presentation", width: "100%", cellPadding: 0, cellSpacing: 0, children: (0, jsx_runtime_1.jsx)("tr", { children: (0, jsx_runtime_1.jsxs)("td", { style: {
                        backgroundColor: bk.colors.primary,
                        borderRadius: bk.radius.card,
                        padding: "20px 24px",
                        textAlign: "center",
                    }, children: [(0, jsx_runtime_1.jsx)(components_1.Text, { style: {
                                margin: "0 0 4px",
                                fontFamily: bk.fonts.sans,
                                fontSize: 12,
                                letterSpacing: "0.14em",
                                textTransform: "uppercase",
                                color: bk.colors.onPrimaryMuted,
                                textAlign: "center",
                            }, children: interpolate(block.props.label, variables) }), (0, jsx_runtime_1.jsx)(components_1.Text, { style: {
                                margin: 0,
                                fontFamily: bk.fonts.serif,
                                fontSize: 26,
                                fontWeight: 600,
                                color: bk.colors.onPrimary,
                                textAlign: "center",
                            }, children: display })] }) }) }) }));
}
function SocialBlockView({ block, ctx, }) {
    const { brandKit: bk } = ctx;
    if (block.props.links.length === 0)
        return null;
    return ((0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-pad", style: { padding: "20px 36px 0", textAlign: "center" }, children: (0, jsx_runtime_1.jsx)(components_1.Text, { style: { margin: 0, fontFamily: bk.fonts.sans, fontSize: 13, color: bk.colors.muted, textAlign: "center" }, children: block.props.links.map((l, i) => ((0, jsx_runtime_1.jsxs)(React.Fragment, { children: [i > 0 ? "  ·  " : "", (0, jsx_runtime_1.jsx)(components_1.Link, { href: l.url, style: { color: bk.colors.secondary }, children: l.platform })] }, l.platform))) }) }));
}
/**
 * `header` and `footer` content blocks from the content model are intentionally
 * NOT rendered here — the BrandEmailLayout shell owns the brand header and footer
 * so every email gets one consistent, on-brand chrome. Dropping these avoids a
 * duplicate logo / double footer.
 */
function isChromeBlock(block) {
    return block.type === "header" || block.type === "footer";
}
function renderBlock(block, ctx) {
    if (isChromeBlock(block))
        return null;
    switch (block.type) {
        case "hero":
            return (0, jsx_runtime_1.jsx)(HeroBlockView, { block: block, ctx: ctx });
        case "text":
            return (0, jsx_runtime_1.jsx)(TextBlockView, { block: block, ctx: ctx });
        case "image":
            return (0, jsx_runtime_1.jsx)(ImageBlockView, { block: block, ctx: ctx });
        case "button":
            return (0, jsx_runtime_1.jsx)(ButtonBlockView, { block: block, ctx: ctx });
        case "divider":
            return (0, jsx_runtime_1.jsx)(DividerBlockView, { ctx: ctx });
        case "spacer":
            return (0, jsx_runtime_1.jsx)(SpacerBlockView, { block: block });
        case "product":
            return (0, jsx_runtime_1.jsx)(ProductBlockView, { block: block, ctx: ctx });
        case "product_grid":
            return (0, jsx_runtime_1.jsx)(ProductGridBlockView, { block: block, ctx: ctx });
        case "icon_row":
            return (0, jsx_runtime_1.jsx)(IconRowBlockView, { block: block, ctx: ctx });
        case "testimonial":
            return (0, jsx_runtime_1.jsx)(TestimonialBlockView, { block: block, ctx: ctx });
        case "countdown":
            return (0, jsx_runtime_1.jsx)(CountdownBlockView, { block: block, ctx: ctx });
        case "social":
            return (0, jsx_runtime_1.jsx)(SocialBlockView, { block: block, ctx: ctx });
        case "columns":
            // Columns of arbitrary blocks render their children stacked (mobile-first).
            return ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: block.props.columns.flat().map((b, i) => ((0, jsx_runtime_1.jsx)(React.Fragment, { children: renderBlock(b, ctx) }, b.id ?? i))) }));
        default:
            return null;
    }
}
//# sourceMappingURL=index.js.map