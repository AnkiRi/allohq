import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = { title: "Data processing addendum · joon" };

export default function DpaPage() {
  return <main className="legal-page"><article className="legal-shell">
    <nav className="legal-nav"><Link className="legal-brand" href="/">joon</Link><Link className="legal-back" href="/">Back to joon</Link></nav>
    <h1>Data processing addendum</h1><p className="legal-updated">Draft effective 3 September 2026</p>
    <p>This addendum describes Joon’s processing of personal data for a merchant using the service. It supplements the Terms of Service. The merchant is the controller or business and the Joon operator is the processor or service provider unless applicable law assigns different roles.</p>
    <h2>Instructions and purpose</h2><p>We process personal data only on the merchant’s documented instructions, including the configuration and approved actions made through Joon, to synchronize Shopify data, build eligible audiences, generate approved email, enforce suppression, measure holdouts, provide support and secure the service.</p>
    <h2>People, data and duration</h2><p>Data may concern merchant staff, customers and storefront visitors. It may include identifiers, contact details, consent status, commerce history, product interests, minimized storefront events and email-delivery events. Processing continues while the merchant uses Joon and for the documented deletion and legal-retention periods after termination.</p>
    <h2>Confidentiality and security</h2><p>People authorized to process personal data are bound by confidentiality. Technical and organizational measures include tenant-scoped authorization, encrypted Shopify credentials, signed requests, restricted production secrets, delivery approval and suppression controls, idempotency, logging, backups and incident procedures appropriate to the deployment.</p>
    <h2>Subprocessors</h2><p>The merchant authorizes the providers on the <Link href="/subprocessors">subprocessor list</Link>. We remain responsible for requiring subprocessors to protect data consistently with this addendum. Material changes will be published there before they take effect where reasonably possible.</p>
    <h2>Requests, incidents and audits</h2><p>We will reasonably assist with data-subject requests, security incidents, impact assessments and regulator inquiries relating to the service. We will provide information reasonably necessary to demonstrate compliance, subject to confidentiality and security limits.</p>
    <h2>Deletion and return</h2><p>At termination or on a valid instruction, we delete or return personal data unless law requires retention. Shopify customer and shop redaction requests are processed through authenticated mandatory webhooks.</p>
    <h2>International transfers</h2><p>Where personal data is transferred internationally, the parties will use a lawful transfer mechanism required for the relevant locations.</p>
    <p className="legal-note">This is an implementation-ready draft, not an executed agreement. The legal operator, registered address, governing terms, transfer mechanism, security schedule and signature blocks require counsel/founder approval before public submission.</p>
    <footer className="legal-footer">Questions: <a href="mailto:founders@allohq.ai">founders@allohq.ai</a></footer>
  </article></main>;
}
