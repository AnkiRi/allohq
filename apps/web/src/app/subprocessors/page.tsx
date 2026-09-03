import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = { title: "Subprocessors · joon" };

export default function SubprocessorsPage() {
  return <main className="legal-page"><article className="legal-shell">
    <nav className="legal-nav"><Link className="legal-brand" href="/">joon</Link><Link className="legal-back" href="/">Back to joon</Link></nav>
    <h1>Subprocessors</h1><p className="legal-updated">Last updated 3 September 2026</p>
    <p>Joon uses specialist providers to operate the service. The exact production deployment must match this list before launch.</p>
    <h2>Current service categories</h2><ul><li><strong>Shopify</strong> — commerce platform, installation and source data.</li><li><strong>Clerk</strong> — standalone account authentication where that flow is used.</li><li><strong>Resend</strong> — email delivery and delivery-event processing.</li><li><strong>Railway</strong> — API, worker and managed infrastructure hosting.</li><li><strong>Vercel</strong> — web application hosting and delivery.</li><li><strong>Configured AI providers</strong> — content generation and analysis; the selected provider depends on the merchant’s model harness.</li></ul>
    <p className="legal-note">The production database/Redis vendors, AI provider names, processing locations and transfer mechanisms must be confirmed from deployed accounts before submission. This page must not be represented as final until that check is complete.</p>
    <h2>Questions or changes</h2><p>Contact <a href="mailto:founders@allohq.ai">founders@allohq.ai</a> with subprocessor questions.</p>
    <footer className="legal-footer">Joon · hand-built in Bangalore</footer>
  </article></main>;
}
