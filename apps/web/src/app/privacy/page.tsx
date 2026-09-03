import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = { title: "Privacy policy · joon" };

export default function PrivacyPage() {
  return <main className="legal-page"><article className="legal-shell">
    <nav className="legal-nav"><Link className="legal-brand" href="/">joon</Link><Link className="legal-back" href="/">Back to joon</Link></nav>
    <h1>Privacy policy</h1><p className="legal-updated">Effective 3 September 2026</p>
    <p>Joon is a Shopify email decision product operated by AlloHQ. This policy explains how we handle merchant, staff, customer and storefront data when a merchant installs or uses Joon.</p>
    <h2>Data we process</h2><ul><li>Shop and staff identifiers needed to install, authenticate and authorize the app.</li><li>Products, collections, customers, orders, checkouts, fulfilments and marketing-consent state needed for segmentation, approved email journeys and outcome reporting.</li><li>Consent-aware storefront events such as page, product, collection, search, cart and checkout activity. Direct contact, address and payment fields are removed from pixel payloads before storage.</li><li>Email delivery, bounce, complaint and unsubscribe events needed for reporting and suppression.</li><li>Campaign, journey, approval, holdout and decision records created in Joon.</li></ul>
    <h2>How we use data</h2><p>We use data only to provide, secure and improve the merchant’s Joon workspace: synchronize Shopify data, construct audiences, enforce consent and suppression, generate drafts, execute merchant-approved email, measure treatment against control, prevent duplicate delivery, investigate incidents and comply with legal requests.</p>
    <h2>AI processing</h2><p>Joon may send the minimum context needed to configured AI providers to generate or analyze merchant-requested content. Joon does not expose one merchant’s identifiable customer data to another merchant.</p>
    <h2>Sharing</h2><p>We share data only with service providers needed to operate Joon, with the merchant’s configured delivery provider, when required by law, or during a corporate transaction subject to appropriate safeguards. Current providers are listed on our <Link href="/subprocessors">subprocessor page</Link>.</p>
    <h2>Retention and deletion</h2><p>Shopify privacy requests are authenticated and processed through mandatory webhooks. Customer data requests are exported securely; customer and shop redaction requests delete or anonymize applicable data. Operational webhook and provider-event deduplication records are retained only as needed for safe delivery and audit. Uninstall revokes the connection and begins the applicable Shopify deletion timetable.</p>
    <h2>Security</h2><p>Joon encrypts Shopify credentials at rest, verifies signed Shopify and delivery-provider requests, uses short-lived embedded identity tokens, restricts store access by tenant and applies delivery kill switches, suppression and idempotency controls. No system is perfectly secure; contact us promptly if you believe data is at risk.</p>
    <h2>Your choices and requests</h2><p>Merchants can uninstall Joon through Shopify. Customers should normally contact the merchant that collected their data; Shopify’s privacy-request flow will relay applicable requests to us. For privacy questions, email <a href="mailto:founders@allohq.ai">founders@allohq.ai</a>.</p>
    <p className="legal-note">Before public submission, the operator’s registered legal name and postal address must be added here after founder/legal review.</p>
    <footer className="legal-footer">Joon · hand-built in Bangalore</footer>
  </article></main>;
}
