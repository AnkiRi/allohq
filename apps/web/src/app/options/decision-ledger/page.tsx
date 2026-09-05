import Link from "next/link";
import "./decision-ledger.css";

const decisions = [
  ["Ankita", "held back", "bought full price", "₹1,840 protected"],
  ["Meera", "email · 10:00", "opened · purchased", "+₹2,120 observed"],
  ["Rohan", "stayed silent", "returned in 2 days", "discount avoided"],
  ["Kavya", "email · 18:00", "ignored", "state updated"],
];

export const metadata = { title: "Joon — The decision ledger", description: "A visual concept for Joon: every action, silence and outcome." };

export default function DecisionLedgerLanding() {
  return <main className="ledger-page">
    <nav className="ledger-nav"><Link href="/" className="ledger-logo"><i />joon</Link><div><a href="#ledger">Decision ledger</a><a href="#journeys">Journeys</a><a href="#proof">Proof</a></div><Link href="/sign-up" className="ledger-cta">Start free</Link></nav>
    <section className="ledger-hero">
      <div className="ledger-copy"><p className="ledger-kicker">The marketer that knows when to stay quiet.</p><h1>Every send leaves a receipt.<br/><em>Every silence does too.</em></h1><p>Joon builds campaigns and journeys in your brand voice, holds back a real control, and records what happened next—so revenue is earned, not claimed.</p><div className="ledger-actions"><Link href="/sign-up" className="ledger-cta">Connect Shopify</Link><a href="#ledger">See a decision unfold ↓</a></div></div>
      <div className="ledger-scene" aria-label="Campaign decision preview">
        <div className="scene-head"><span>30% off · top 20 customers</span><b>ready for approval</b></div>
        <div className="scene-question">Should all 20 get this?</div>
        <div className="scene-answer"><strong>No.</strong> 2 bought this week. 3 enter control. 15 receive the email.</div>
        <div className="scene-flow"><span>20 requested</span><i/><span>15 email</span><i/><span>3 silence</span><i/><span>2 protected</span></div>
        <div className="scene-note">Approval freezes this exact map. It cannot reshuffle during delivery.</div>
      </div>
    </section>
    <section className="ledger-marquee"><span>campaigns</span><b>·</b><span>journeys</span><b>·</b><span>brand voice</span><b>·</b><span>holdouts</span><b>·</b><span>outcomes</span></section>
    <section className="ledger-section" id="ledger"><div className="section-intro"><p>The compounding asset</p><h2>A checkbox can be copied.<br/>This history cannot.</h2><span>Every campaign adds another decision, counterfactual and outcome to the brand’s longitudinal ledger.</span></div><div className="decision-board">{decisions.map((d,i)=><article key={d[0]} style={{"--delay":`${i*120}ms`} as React.CSSProperties}><div className="decision-person"><span>{d[0]?.charAt(0)}</span><b>{d[0]}</b></div><p>{d[1]}</p><div className="decision-line"/><p>{d[2]}</p><strong>{d[3]}</strong></article>)}</div></section>
    <section className="journey-section" id="journeys"><div><p>Always-on, never unattended</p><h2>Journeys that wait for the right moment.</h2><span>Welcome, checkout recovery, post-purchase, replenishment, win-back and anniversary flows—all email-first, merchant activated, and approval protected.</span></div><div className="journey-river"><b>Viewed skincare</b><i/><b>Added serum</b><i/><b>Checkout paused</b><i/><strong>Wait 3h</strong><i/><b>Email in brand voice</b><i/><em>Outcome</em></div></section>
    <section className="proof-section" id="proof"><div className="proof-number">01</div><h2>One honest promise.</h2><p>Joon does not call a heuristic a probability, a tiny campaign an experiment, or attributed revenue incremental lift. It shows the evidence level beside every answer.</p><div className="proof-stamps"><span>Human approval</span><span>Email only · v1</span><span>Control by default</span><span>Free to start</span></div></section>
    <footer><Link href="/" className="ledger-logo"><i/>joon</Link><p>Send less. Learn more. Keep the margin.</p><Link href="/sign-up">Build your first campaign →</Link></footer>
  </main>;
}
