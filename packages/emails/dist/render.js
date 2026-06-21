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
exports.renderGeneratedEmail = renderGeneratedEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const React = __importStar(require("react"));
const render_1 = require("@react-email/render");
const BrandEmailLayout_1 = require("./BrandEmailLayout");
const blocks_1 = require("./blocks");
/** The full email document, brand-kit-driven. */
function GeneratedEmailDocument({ content, brandKit, ctx, }) {
    const preview = content.previewText || content.subject || "";
    return ((0, jsx_runtime_1.jsx)(BrandEmailLayout_1.BrandEmailLayout, { brandKit: brandKit, preview: preview, children: content.blocks.map((block, i) => ((0, jsx_runtime_1.jsx)(React.Fragment, { children: (0, blocks_1.renderBlock)(block, ctx) }, block.id ?? i))) }));
}
/** Inject UTM params into <a href> URLs matching the store domain. */
function injectUtmParams(html, tracking) {
    return html.replace(/href="([^"]+)"/g, (_m, url) => {
        if (url.startsWith("mailto:") || url.startsWith("#") || url.includes("unsubscribe")) {
            return `href="${url}"`;
        }
        if (!url.startsWith("http"))
            return `href="${url}"`;
        if (tracking.storeDomain && !url.includes(tracking.storeDomain)) {
            return `href="${url}"`;
        }
        const sep = url.includes("?") ? "&" : "?";
        const params = [
            `utm_source=${encodeURIComponent(tracking.utmSource)}`,
            `utm_medium=${encodeURIComponent(tracking.utmMedium)}`,
            `utm_campaign=${encodeURIComponent(tracking.utmCampaign)}`,
            ...(tracking.utmContent ? [`utm_content=${encodeURIComponent(tracking.utmContent)}`] : []),
        ].join("&");
        return `href="${url}${sep}${params}"`;
    });
}
/**
 * Render a generated email (EmailBlock[] content model) into bulletproof,
 * brand-styled HTML via React Email.
 *
 * The brand kit drives the entire look: header (logo/wordmark), colors, fonts,
 * footer, and every block component — so every generated email automatically
 * looks like the sending brand.
 *
 * Output is table-based, single-column mobile-fluid, and dark-mode-safe.
 */
async function renderGeneratedEmail(content, brandKit, options = {}) {
    const ctx = {
        brandKit,
        variables: options.variables ?? {},
        products: options.products ?? {},
        dynamicProducts: options.dynamicProducts,
        previewMode: options.previewMode,
    };
    let html = await (0, render_1.render)((0, jsx_runtime_1.jsx)(GeneratedEmailDocument, { content: content, brandKit: brandKit, ctx: ctx }), { pretty: false });
    if (options.tracking) {
        html = injectUtmParams(html, options.tracking);
    }
    return html;
}
//# sourceMappingURL=render.js.map