import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = { title: "Terms of service · joon" };

export default function TermsPage() {
  return <main className="legal-page"><article className="legal-shell">
    <nav className="legal-nav"><Link className="legal-brand" href="/">joon</Link><Link className="legal-back" href="/">Back to joon</Link></nav>
    <h1>Terms of service</h1><p className="legal-updated">Effective 3 September 2026</p>
    <p>These terms govern a merchant’s use of Joon, a Shopify email decision product operated by AlloHQ. Installing or using Joon means the merchant accepts these terms.</p>
    <h2>The service</h2><p>Joon helps merchants create and approve email campaigns and journeys, resolve eligible audiences, create Shopify discounts, run holdouts and report outcomes. Public v1 is email-only and free. Features may change as the early product develops.</p>
    <h2>Merchant responsibilities</h2><ul><li>Use Joon only for a store and customer data you are authorized to manage.</li><li>Maintain lawful email consent, accurate sender information and a verified sending domain.</li><li>Review the audience, offer and content and explicitly approve each send or activated journey.</li><li>Comply with applicable marketing, consumer, privacy and promotion laws.</li><li>Keep Shopify, Joon and delivery-provider credentials secure.</li></ul>
    <h2>Delivery and holdouts</h2><p>Joon can deliberately withhold a control group. A holdout is part of measurement and will not receive that treatment. Delivery depends on Shopify, the configured email provider, DNS, recipient servers and other systems outside Joon’s control. Reports are analytical estimates, not guarantees of revenue or causation.</p>
    <h2>Acceptable use</h2><p>Do not use Joon for unlawful, deceptive, abusive or unsolicited communication; to upload malicious code; to bypass consent, suppression, rate or approval controls; or to interfere with the service or another merchant.</p>
    <h2>Merchant content and data</h2><p>The merchant retains its rights in merchant content and customer data and grants us the limited rights needed to operate the service. Feedback may be used to improve Joon without identifying the merchant publicly unless separately agreed.</p>
    <h2>Suspension and termination</h2><p>We may pause delivery or access when required to protect recipients, deliverability, the service or comply with law. A merchant may stop using Joon and uninstall it at any time.</p>
    <h2>Disclaimers and liability</h2><p>Joon is provided on an “as available” basis during its free early release. To the extent permitted by law, we disclaim implied warranties and are not responsible for indirect, special or consequential loss. Mandatory rights that cannot lawfully be excluded remain unaffected.</p>
    <h2>Contact</h2><p>Questions may be sent to <a href="mailto:founders@allohq.ai">founders@allohq.ai</a>.</p>
    <p className="legal-note">Governing law, venue, registered operator details and a final liability formulation require founder/legal approval before Shopify submission.</p>
    <footer className="legal-footer">Joon · hand-built in Bangalore</footer>
  </article></main>;
}
