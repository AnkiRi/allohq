import type { Metadata } from "next";
import Link from "next/link";
import { AmbientField } from "./AmbientField";
import { ApprovalSurface, HoldoutMarks } from "./Surfaces";
import { BlastComparison, JourneyScene, LedgerScene, ReceiptStream } from "./SpecificationScenes";
import "./main-a2.css";

export const metadata: Metadata = {
  title: "Joon — the email tool that gets paid to send less",
  description:
    "Build Shopify email campaigns and journeys with explicit approval, purposeful holdouts, and evidence of what sending changed.",
};

const signup = "/sign-up";

export default function MainA2Page() {
  return (
    <div className="main-a2">
      <header className="a2-nav">
        <a href="#top" className="a2-logo">
          <i />
          joon
        </a>
        <nav aria-label="Primary">
          <a href="#what">what it does</a>
          <a href="#proof">how it proves it</a>
          <a href="#pricing">what it costs</a>
        </nav>
        <Link href={signup} className="a2-button">
          Start free
        </Link>
      </header>

      <main id="top">
        <section className="a2-hero a2-wrap">
          <AmbientField className="a2-hero__field" />
          <div className="a2-hero__copy">
            <p className="a2-kicker">Shopify email · approval first</p>
            <h1>The email tool that gets paid to send less.</h1>
            <p className="a2-lede">
              It learns each customer, holds some back on purpose, and shows you what happened to
              both. You approve every send.
            </p>
            <div className="a2-cta">
              <Link href={signup} className="a2-button a2-button--large">
                Start free
              </Link>
              <span>free while we prove it with the first brands</span>
            </div>
            <p className="a2-wedge">
              Retention is where we start. Every decision stays on the same customer record.
            </p>
          </div>
          <div className="a2-hero__surface">
            <ApprovalSurface />
          </div>
        </section>

        <ReceiptStream />

        <section className="a2-ledger-section a2-wrap" id="what">
          <div className="a2-heading">
            <p className="a2-kicker">Every decision stays on the record</p>
            <h2>Ankita, eight decisions.</h2>
            <p>Every field comes from order history alone. Watch the timing change.</p>
          </div>
          <LedgerScene />
        </section>

        <section className="a2-compare">
          <div className="a2-wrap">
            <BlastComparison />
          </div>
        </section>

        <section className="a2-proof a2-wrap" id="proof">
          <div className="a2-heading">
            <p className="a2-kicker">Purposeful holdouts</p>
            <h2>More revenue from fewer messages. And you can prove it.</h2>
            <p>
              A few eligible customers are left out on purpose. What they buy anyway is the floor.
              Only the gap above it counts as a result.
            </p>
          </div>
          <HoldoutMarks />
          <div className="a2-evidence">
            <span>unmeasured · &lt;7</span>
            <span className="is-active">directional · &lt;30 / arm</span>
            <span>measurement ready</span>
          </div>
          <p className="a2-proof-note">
            Holdouts are one-way: every campaign run without one loses that proof forever. Figures
            illustrative.
          </p>
        </section>

        <section className="a2-journeys">
          <div className="a2-wrap">
            <div className="a2-heading">
              <p className="a2-kicker">Email journeys</p>
              <h2>Journeys that wait for the right moment.</h2>
              <p>
                Welcome, abandoned checkout, post-purchase, win-back and reorder. Joon can decide
                that no email should be sent—and records why.
              </p>
            </div>
            <JourneyScene />
            <p className="a2-concept-note">
              Conceptual decision outcome—not shown as a draggable editor node.
            </p>
          </div>
        </section>

        <section className="a2-acquisition a2-wrap">
          <div className="a2-heading">
            <p className="a2-kicker">Consent-aware acquisition</p>
            <h2>Grow the list. Don&apos;t pay twice for the same customer.</h2>
            <p>
              Popups, inline forms and hosted pages—with market-aware consent and incentives
              protected from repeat or unnecessary issuance.
            </p>
          </div>
          <div className="a2-acquisition__grid">
            <div className="a2-popup" aria-label="Illustrative email signup form">
              <span>10% off your first order</span>
              <label>
                Email<div className="a2-faux-input">you@example.com</div>
              </label>
              <div className="a2-check">
                <i /> Yes, email me offers and updates.
              </div>
              <div className="a2-faux-button">Get my code</div>
            </div>
            <div className="a2-market">
              <span>Consent wording</span>
              <dl>
                <div>
                  <dt>EU / UK</dt>
                  <dd>confirm by email</dd>
                </div>
                <div>
                  <dt>Canada</dt>
                  <dd>confirm by email</dd>
                </div>
                <div>
                  <dt>United States</dt>
                  <dd>single opt-in</dd>
                </div>
                <div>
                  <dt>Australia</dt>
                  <dd>confirm by email</dd>
                </div>
              </dl>
              <small>Phone consent is always separate.</small>
            </div>
            <div className="a2-protected">
              <i>○</i>
              <strong>Incentive held</strong>
              <p>Already subscribed or bought recently. No new code issued.</p>
            </div>
          </div>
        </section>

        <section className="a2-pricing" id="pricing">
          <div className="a2-wrap a2-pricing__grid">
            <div>
              <p className="a2-kicker">Aligned incentives</p>
              <h2>Free in v1. Never per email.</h2>
              <p>
                Free right now. Later, a fee to run it and a share of lift the held-back group
                proves. Never per email. Never a cut of your gross revenue.
              </p>
            </div>
            <dl className="a2-bill">
              <div>
                <dt>now</dt>
                <dd>free</dd>
              </div>
              <div>
                <dt>later · to run it</dt>
                <dd>a flat fee</dd>
              </div>
              <div>
                <dt>later · if it works</dt>
                <dd>share of proven lift</dd>
              </div>
              <div className="is-zero">
                <dt>per email</dt>
                <dd>never</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="a2-founder a2-wrap">
          <blockquote>
            “At Zymrat, the moment I stopped writing every email myself was the moment retention
            died. Joon would have given me back my Sundays.”
          </blockquote>
          <p>Ujjawal Asthana · founder, Joon · ex-founder, Zymrat</p>
        </section>

        <section className="a2-final">
          <AmbientField />
          <div>
            <p className="a2-kicker">The first stores</p>
            <h2>Five founding partners. Shape Joon with us.</h2>
            <p>
              Each store&apos;s measurement starts when it joins. Nothing on this page is presented
              as a merchant result yet—that is what the first stores are for.
            </p>
            <div className="a2-capacity" aria-label="Five founding-partner places available">
              {Array.from({ length: 8 }, (_, index) => (
                <i key={index} className={index < 3 ? "is-on" : index === 3 ? "is-next" : ""} />
              ))}
            </div>
            <small>[3] of 8 onboarded · [5] spots left · placeholder until live</small>
            <Link href={signup} className="a2-button a2-button--large">
              Start free
            </Link>
          </div>
        </section>
      </main>
      <footer className="a2-footer">
        <span>hand-built in Bangalore</span>
        <span>© 2026 Joon</span>
      </footer>
    </div>
  );
}
