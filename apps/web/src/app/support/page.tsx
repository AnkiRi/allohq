import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = { title: "Support · joon" };

export default function SupportPage() {
  return <main className="legal-page"><article className="legal-shell">
    <nav className="legal-nav"><Link className="legal-brand" href="/">joon</Link><Link className="legal-back" href="/">Back to joon</Link></nav>
    <h1>Support</h1><p className="legal-updated">For merchants using Joon</p>
    <p>Email <a href="mailto:founders@allohq.ai?subject=Joon%20support">founders@allohq.ai</a> with your Shopify store domain, a short description and any relevant campaign or journey ID. Do not email customer lists, access tokens or passwords.</p>
    <h2>Delivery emergency</h2><p>If an approved email should not continue, pause the store in Joon first, then use the subject “URGENT — STOP DELIVERY”. Include the store domain and campaign or journey ID. Joon also has provider-wide and per-store delivery stops.</p>
    <h2>Security and privacy</h2><p>Use the subject “SECURITY” for a suspected security issue and “PRIVACY” for a data request. Customer privacy requests should normally begin with the Shopify merchant that collected the data.</p>
    <h2>Support hours</h2><p>During the public v1, support is founder-operated from Bangalore, India. We aim to acknowledge delivery emergencies within four business hours and other requests within one business day, Monday–Friday, excluding local public holidays.</p>
    <p className="legal-note">The published response targets require a real monitored mailbox and escalation owner before submission.</p>
    <footer className="legal-footer">Joon · hand-built in Bangalore</footer>
  </article></main>;
}
