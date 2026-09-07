import type { Metadata } from "next";
import Link from "next/link";
import { AmbientField } from "../main-a2/AmbientField";
import { ApprovalSurface, HoldoutMarks, Receipt } from "../main-a2/Surfaces";
import { JourneyScene, ReceiptStream } from "../main-a2/SpecificationScenes";
import { ThemeSwitcher } from "../main-a2/ThemeSwitcher";
import "../main-a2/main-a2.css";
import "./main-a3.css";

export const metadata: Metadata = {
  title: "Joon — your retention team, already at work",
  description:
    "Joon prepares Shopify email campaigns in your brand voice, asks for approval, and measures what sending actually changed.",
};

const signup = "/sign-up";
const THEME_INIT = `(function(){try{var ok=function(v){return v==='drenched'||v==='light'||v==='dark'};var q=new URLSearchParams(location.search).get('pal');var s=localStorage.getItem('allo-theme');var p=ok(q)?q:ok(s)?s:'light';var el=(document.currentScript&&document.currentScript.parentElement)||document.querySelector('.main-a3');if(el)el.setAttribute('data-pal',p)}catch(e){}})();`;

export default function MainA3Page() {
  return (
    <div className="main-a2 main-a3" data-pal="light" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      <header className="a2-nav">
        <a href="#top" className="a2-logo">
          <i />
          joon
        </a>
        <nav aria-label="Primary">
          <a href="#morning">what it does</a>
          <a href="#proof">how it proves it</a>
          <a href="#email">what it creates</a>
        </nav>
        <div className="a2-nav__actions">
          <ThemeSwitcher defaultTheme="light" />
          <Link href={signup} className="a2-button">
            Start free
          </Link>
        </div>
      </header>

      <main id="top">
        <section className="a3-hero a2-wrap">
          <AmbientField className="a3-hero__field" />
          <div className="a3-hero__copy">
            <span className="a3-overline">Shopify email · approval first</span>
            <h1>Your retention team is already at work.</h1>
            <p>
              Joon prepares the audience, message and holdout in your brand voice. You approve the
              exact send. Then Joon shows what changed—and who was better left alone.
            </p>
            <div className="a2-cta">
              <Link href={signup} className="a2-button a2-button--large">
                Start free
              </Link>
              <span>free for the first stores · never per email</span>
            </div>
          </div>
          <div className="a3-hero__surface">
            <ApprovalSurface />
          </div>
        </section>

        <section className="a3-morning a2-wrap" id="morning">
          <div className="a3-morning__note">
            <header>
              <span>from Joon · overnight</span>
              <time>Mon 23 Jun · 5:54</time>
            </header>
            <h2>Good morning.</h2>
            <p>
              Quiet night. We read all 4,820 customers. Three things need your call. Nothing has
              gone out.
            </p>
            <Receipt
              time="05:06"
              name="WIN-BACK"
              decision="Draft ready"
              reason="Buyers quiet since spring · holdout included"
            />
            <Receipt
              time="05:21"
              name="REEMA"
              decision="Reorder nudge"
              reason="Timed to her cycle, not to a Tuesday"
            />
            <Receipt
              time="05:37"
              name="9AM BLAST"
              decision="Not sent"
              reason="Priya bought yesterday · left alone"
              silent
            />
          </div>
          <div className="a3-morning__copy">
            <span className="a3-overline">Useful before breakfast</span>
            <h2>Drafts before sunrise. Your call over coffee.</h2>
            <p>
              Switch on a journey or ask in plain English. Joon does the preparation, explains the
              trade-offs and waits for you.
            </p>
            <strong>
              Nothing ships over your head. That is a rule in the code, not a setting.
            </strong>
          </div>
        </section>

        <ReceiptStream />

        <section className="a3-rohan" id="proof">
          <div className="a2-wrap a3-rohan__grid">
            <div>
              <span className="a3-overline">What a campaign report misses</span>
              <h2>Rohan converted every time.</h2>
              <p>
                So the dashboard called him a success. But his full-price purchase rate fell from
                71% to 42% while every campaign kept giving him a code.
              </p>
            </div>
            <div className="a3-rohan__receipts">
              <Receipt
                time="ORDER 21"
                name="71% FULL PRICE"
                decision="Sent · 20% off"
                reason="Bought ₹1,800 · code used"
              />
              <Receipt
                time="ORDER 23"
                name="62% FULL PRICE"
                decision="Silent · control"
                reason="Bought ₹1,700 · full price · 8 days later"
                silent
              />
              <Receipt
                time="ORDER 25"
                name="50% FULL PRICE"
                decision="Silent · control"
                reason="Bought ₹1,900 · full price · again"
                silent
              />
              <Receipt
                time="ORDER 26"
                name="42% FULL PRICE"
                decision="Sent · new arrivals · no code"
                reason="Bought ₹1,850 · full price"
              />
              <p>Illustrative customer sequence</p>
            </div>
          </div>
        </section>

        <section className="a3-proof a2-wrap">
          <div className="a3-section-copy">
            <h2>Fewer messages. Evidence you can defend.</h2>
            <p>
              Some eligible customers are left untouched. What they buy anyway becomes the baseline;
              only the gap above it counts as a result.
            </p>
          </div>
          <HoldoutMarks />
          <div className="a2-evidence">
            <span>unmeasured · &lt;7</span>
            <span className="is-active">directional · &lt;30 / arm</span>
            <span>measurement ready</span>
          </div>
          <small>
            Figures illustrative. Joon does not show a lift number until a real holdout produces
            one.
          </small>
        </section>

        <section className="a3-email" id="email">
          <div className="a2-wrap a3-email__grid">
            <div className="a3-section-copy">
              <span className="a3-overline">Beautiful email, still unmistakably yours</span>
              <h2>It decides carefully. It writes in your voice.</h2>
              <p>
                Your colors, typography, tone, banned phrases and offer guardrails shape every
                draft. The merchant sees the email—not an abstract promise about AI.
              </p>
              <dl className="a3-voice">
                <div>
                  <dt>Warmth</dt>
                  <dd>friendly</dd>
                </div>
                <div>
                  <dt>Humor</dt>
                  <dd>light</dd>
                </div>
                <div>
                  <dt>Discount</dt>
                  <dd>≤15%</dd>
                </div>
                <div>
                  <dt>Voice</dt>
                  <dd>clear, never breathless</dd>
                </div>
              </dl>
            </div>
            <article className="a3-email-preview">
              <header>
                <i />
                <span>ASTER &amp; LOOM</span>
              </header>
              <div className="a3-email-preview__hero">
                <small>For the pieces you keep reaching for</small>
                <h3>Linen, after the long day.</h3>
                <p>
                  Quiet layers for warm evenings. No countdown. No shouting. Just the edit we
                  thought you would want to see.
                </p>
                <button>See the linen edit</button>
              </div>
              <footer>Sent only to customers for whom this was timely · unsubscribe</footer>
            </article>
          </div>
        </section>

        <section className="a3-journeys">
          <div className="a2-wrap">
            <div className="a3-section-copy">
              <h2>Journeys that know when to wait.</h2>
              <p>
                Welcome, checkout recovery, post-purchase, win-back and replenishment—with silence
                and holdout built into the decision.
              </p>
            </div>
            <JourneyScene />
          </div>
        </section>

        <section className="a3-acquisition a2-wrap">
          <div className="a3-section-copy">
            <h2>Grow the list. Don’t discount the same person twice.</h2>
            <p>
              Consent-aware popups and hosted forms protect incentives from repeat play and
              recent-buyer waste.
            </p>
          </div>
          <div className="a3-acquisition__row">
            <div className="a2-popup">
              <span>10% off your first order</span>
              <label>
                Email<div className="a2-faux-input">you@example.com</div>
              </label>
              <div className="a2-check">
                <i /> Yes, email me offers and updates.
              </div>
              <div className="a2-faux-button">Get my code</div>
            </div>
            <div className="a2-protected">
              <i>○</i>
              <strong>Incentive held</strong>
              <p>Already subscribed or bought recently. No new code issued.</p>
            </div>
            <div className="a3-consent">
              <strong>Consent follows the market</strong>
              <span>EU / UK · confirm by email</span>
              <span>US · single opt-in</span>
              <span>Canada · confirm by email</span>
              <small>Phone consent is always separate.</small>
            </div>
          </div>
        </section>

        <section className="a3-close">
          <AmbientField />
          <div className="a2-wrap a3-close__grid">
            <div>
              <h2>Free in v1. Never per email.</h2>
              <p>
                Later: a base fee to run retention and a share of lift proven against a holdout.
                Never a percentage of revenue that would have happened anyway.
              </p>
            </div>
            <div className="a3-founder">
              <blockquote>
                “At Zymrat, the moment I stopped writing every email myself was the moment retention
                died. Joon would have given me back my Sundays.”
              </blockquote>
              <span>Ujjawal Asthana · founder, Joon · ex-founder, Zymrat</span>
            </div>
          </div>
          <div className="a3-final">
            <h2>Five founding partners. Shape Joon with us.</h2>
            <p>We onboard slowly, on purpose. Each store’s measurement starts the day it joins.</p>
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
