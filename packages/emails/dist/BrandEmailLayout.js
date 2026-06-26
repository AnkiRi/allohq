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
exports.BrandEmailLayout = BrandEmailLayout;
const jsx_runtime_1 = require("react/jsx-runtime");
const React = __importStar(require("react"));
const components_1 = require("@react-email/components");
/**
 * Shared identity shell for every generated email: <head> defaults, the
 * brand header (logo or wordmark pill), the content card, and the footer.
 * Driven entirely by the BrandKit so every brand's emails inherit one
 * consistent, calm, premium look.
 *
 * Dark-mode-safe:
 *  - color-scheme + supported-color-schemes meta tells clients we handle both.
 *  - the wordmark sits on a brand pill, not transparent — it never vanishes
 *    when Gmail/Apple invert a light layout.
 *  - borders use a hairline that survives dark inversion.
 *  - mobile-first: fluid single column, fluid heading sizes.
 */
function BrandEmailLayout({ brandKit, preview, children }) {
    const { colors, fonts, logo, voice, footer } = brandKit;
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { lang: "en", children: [(0, jsx_runtime_1.jsxs)(components_1.Head, { children: [(0, jsx_runtime_1.jsx)("meta", { name: "color-scheme", content: "light dark" }), (0, jsx_runtime_1.jsx)("meta", { name: "supported-color-schemes", content: "light dark" }), (0, jsx_runtime_1.jsx)("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }), (0, jsx_runtime_1.jsx)("style", { dangerouslySetInnerHTML: {
                            __html: `
              a { color: ${colors.secondary}; }
              img { max-width: 100%; }
              @media (prefers-color-scheme: dark) {
                .bk-paper { background-color: #14150F !important; }
                .bk-surface { background-color: #1C1E16 !important; }
                .bk-ink { color: ${colors.paper} !important; }
                .bk-body { color: #D7D4C7 !important; }
                .bk-muted { color: #9C9A8B !important; }
                .bk-line { border-color: #2F3326 !important; }
                .bk-accent { background-color: #20231A !important; }
              }
              @media only screen and (max-width: 600px) {
                .bk-pad { padding-left: 22px !important; padding-right: 22px !important; }
                .bk-h1 { font-size: 28px !important; line-height: 34px !important; }
                .bk-stack { display: block !important; width: 100% !important; }
                .bk-stack-img { width: 100% !important; height: auto !important; }
              }
            `,
                        } })] }), (0, jsx_runtime_1.jsx)(components_1.Preview, { children: preview }), (0, jsx_runtime_1.jsx)(components_1.Body, { className: "bk-paper", style: {
                    margin: 0,
                    padding: 0,
                    backgroundColor: colors.paper,
                    fontFamily: fonts.sans,
                    WebkitFontSmoothing: "antialiased",
                }, children: (0, jsx_runtime_1.jsxs)(components_1.Container, { style: {
                        width: "100%",
                        maxWidth: brandKit.contentWidth,
                        margin: "0 auto",
                        padding: "0",
                    }, children: [(0, jsx_runtime_1.jsx)(components_1.Section, { style: { padding: "28px 28px 8px" }, className: "bk-pad", children: logo.src ? ((0, jsx_runtime_1.jsx)(components_1.Img, { src: logo.src, alt: logo.alt, height: 36, style: { display: "block", height: 36, width: "auto", border: 0 } })) : ((0, jsx_runtime_1.jsx)("table", { role: "presentation", cellPadding: 0, cellSpacing: 0, style: { borderCollapse: "collapse" }, children: (0, jsx_runtime_1.jsx)("tr", { children: (0, jsx_runtime_1.jsxs)("td", { style: {
                                            backgroundColor: colors.primary,
                                            borderRadius: 999,
                                            padding: "8px 18px",
                                        }, children: [(0, jsx_runtime_1.jsx)("span", { style: {
                                                    fontFamily: fonts.serif,
                                                    fontSize: 19,
                                                    letterSpacing: "0.04em",
                                                    fontWeight: 600,
                                                    color: colors.onPrimary,
                                                }, children: logo.wordmark }), logo.descriptor ? ((0, jsx_runtime_1.jsx)("span", { style: {
                                                    fontFamily: fonts.sans,
                                                    fontSize: 11,
                                                    letterSpacing: "0.18em",
                                                    textTransform: "uppercase",
                                                    color: colors.onPrimaryMuted,
                                                    marginLeft: 8,
                                                }, children: logo.descriptor })) : null] }) }) })) }), (0, jsx_runtime_1.jsx)(components_1.Section, { className: "bk-surface bk-line", style: {
                                backgroundColor: colors.surface,
                                border: `1px solid ${colors.line}`,
                                borderRadius: brandKit.radius.card,
                                margin: "12px 0 0",
                                overflow: "hidden",
                            }, children: children }), (0, jsx_runtime_1.jsxs)(components_1.Section, { style: { padding: "26px 28px 40px" }, className: "bk-pad", children: [(0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-ink", style: {
                                        margin: "0 0 4px",
                                        fontFamily: fonts.serif,
                                        fontSize: 16,
                                        color: colors.ink,
                                    }, children: voice.brandName }), voice.tagline ? ((0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-muted", style: {
                                        margin: "0 0 14px",
                                        fontFamily: fonts.sans,
                                        fontSize: 13,
                                        lineHeight: "20px",
                                        color: colors.muted,
                                    }, children: voice.tagline })) : null, footer.socialLinks && footer.socialLinks.length > 0 ? ((0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-muted", style: {
                                        margin: "0 0 14px",
                                        fontFamily: fonts.sans,
                                        fontSize: 13,
                                        color: colors.muted,
                                    }, children: footer.socialLinks.map((l, i) => ((0, jsx_runtime_1.jsxs)(React.Fragment, { children: [i > 0 ? "  ·  " : "", (0, jsx_runtime_1.jsx)(components_1.Link, { href: l.url, style: { color: colors.secondary }, children: l.platform })] }, l.platform))) })) : null, (0, jsx_runtime_1.jsx)(components_1.Hr, { className: "bk-line", style: {
                                        borderColor: colors.line,
                                        borderTop: `1px solid ${colors.line}`,
                                        margin: "0 0 14px",
                                    } }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "bk-muted", style: {
                                        margin: 0,
                                        fontFamily: fonts.sans,
                                        fontSize: 12,
                                        lineHeight: "18px",
                                        color: colors.muted,
                                    }, children: ["You're receiving this because you're a ", voice.brandName, " ", "customer.", " ", footer.preferencesUrl ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(components_1.Link, { href: footer.preferencesUrl, style: { color: colors.secondary }, children: "Email preferences" }), " ", "\u00B7", " "] })) : null, (0, jsx_runtime_1.jsx)(components_1.Link, { href: footer.unsubscribeUrl ?? "{{unsubscribe_url}}", style: { color: colors.secondary }, children: "Unsubscribe" })] }), footer.customText ? ((0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-muted", style: {
                                        margin: "10px 0 0",
                                        fontFamily: fonts.sans,
                                        fontSize: 12,
                                        lineHeight: "18px",
                                        color: colors.muted,
                                    }, children: footer.customText })) : null, footer.address ? ((0, jsx_runtime_1.jsx)(components_1.Text, { className: "bk-muted", style: {
                                        margin: "6px 0 0",
                                        fontFamily: fonts.sans,
                                        fontSize: 12,
                                        color: colors.muted,
                                    }, children: footer.address })) : null] })] }) })] }));
}
//# sourceMappingURL=BrandEmailLayout.js.map