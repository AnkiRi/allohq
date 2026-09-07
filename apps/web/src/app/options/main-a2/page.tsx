import type { Metadata } from "next";
import Link from "next/link";
import { AmbientField } from "./AmbientField";
import { ApprovalSurface, DecisionMarks, HoldoutMarks, Receipt } from "./Surfaces";
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
              Every other tool earns more when you send more. Joon decides who is worth writing to
              today, and holds a few back so you can see what the sending actually changed.
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

        <section className="a2-connect a2-wrap" id="what">
          <div className="a2-heading">
            <p className="a2-kicker">From install to approval</p>
            <h2>What happens when you connect it.</h2>
            <p>Four steps. You do the first and the last.</p>
          </div>
          <ol className="a2-steps">
            <li>
              <b>01</b>
              <strong>Connect Shopify</strong>
              <div className="a2-mini-store">
                your-store<small>.myshopify.com</small>
              </div>
              <p>One install. We read products, customers and orders. Nothing is sent.</p>
            </li>
            <li>
              <b>02</b>
              <strong>See what Joon found</strong>
              <ul>
                <li>who is lapsing</li>
                <li>who buys without a nudge</li>
                <li>who waits for a discount</li>
              </ul>
              <p>Your order history becomes a usable customer map.</p>
            </li>
            <li>
              <b>03</b>
              <strong>Ask in plain English</strong>
              <blockquote>“Win back my lapsed buyers before Diwali.”</blockquote>
              <p>Audience, email, offer and holdout are drafted together.</p>
            </li>
            <li>
              <b>04</b>
              <strong>You approve</strong>
              <div className="a2-mini-approve">
                Exact list · email · offer <span>Approve</span>
              </div>
              <p>Change any approved input and approval is required again.</p>
            </li>
          </ol>
        </section>

        <section className="a2-compare">
          <div className="a2-wrap">
            <div className="a2-heading">
              <p className="a2-kicker">The same request, two systems</p>
              <h2>You asked for 30% off to your top twenty.</h2>
            </div>
            <div className="a2-diptych">
              <article>
                <span>Every other email tool</span>
                <h3>Sends to 20.</h3>
                <p>
                  Then reports the revenue that followed as its result. You cannot see who would
                  have bought anyway.
                </p>
                <div className="a2-people">
                  {Array.from({ length: 20 }, (_, i) => (
                    <i key={i} />
                  ))}
                </div>
              </article>
              <article className="is-joon">
                <span>Joon</span>
                <h3>Writes to 16. Explains four.</h3>
                <p>
                  <b>Two bought this week.</b> Leave them out and protect the margin.
                </p>
                <p>
                  <b>Two are held back.</b> What they buy anyway becomes the baseline.
                </p>
                <DecisionMarks />
              </article>
            </div>
          </div>
        </section>

        <div className="a2-breathe">
          <AmbientField />
          <span>consider · sort · send · stay silent · record</span>
        </div>

        <section className="a2-queue a2-wrap">
          <div className="a2-queue__surface">
            <header>
              <span>from Joon · overnight</span>
              <time>Mon 23 Jun · 5:54</time>
            </header>
            <p>
              We read your whole list overnight. Three things need your call. Nothing has gone out.
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
              reason="Left alone · reasoning recorded"
              silent
            />
          </div>
          <div className="a2-queue__copy">
            <p className="a2-kicker">The morning queue</p>
            <h2>It works overnight. You decide over coffee.</h2>
            <p>
              Drafts, audiences and holdouts are prepared while you sleep. Approve the lot, or open
              any line and change it.
            </p>
            <strong>
              Nothing ships over your head. That is a rule in the code, not a setting.
            </strong>
          </div>
        </section>

        <section className="a2-proof a2-wrap" id="proof">
          <div className="a2-heading">
            <p className="a2-kicker">Purposeful holdouts</p>
            <h2>How we know it worked.</h2>
            <p>
              A few eligible customers are left out on purpose. What they buy anyway is the floor.
              Only the gap above it counts as a result.
            </p>
          </div>
          <HoldoutMarks />
          <div className="a2-evidence">
            <span>not enough data yet to call this reliable</span>
            <p>
              We keep this label until both groups are large enough. No lift figure belongs here
              until a real store produces one.
            </p>
          </div>
        </section>

        <section className="a2-journeys">
          <div className="a2-wrap">
            <div className="a2-heading">
              <p className="a2-kicker">Email journeys</p>
              <h2>The automations you expect. Plus a decision others miss.</h2>
              <p>
                Welcome, abandoned checkout, post-purchase, win-back and reorder. Joon can decide
                that no email should be sent—and records why.
              </p>
            </div>
            <div className="a2-flow" aria-label="Conceptual abandoned-checkout journey">
              <div>
                <span>Trigger</span>
                <strong>Checkout started</strong>
              </div>
              <b>→</b>
              <div>
                <span>Wait</span>
                <strong>3 hours</strong>
              </div>
              <b>→</b>
              <div>
                <span>Check</span>
                <strong>Bought already?</strong>
              </div>
              <b>→</b>
              <div className="is-silent">
                <span>Decision</span>
                <strong>Leave alone</strong>
                <small>record why</small>
              </div>
              <b>or</b>
              <div>
                <span>Write</span>
                <strong>In your voice</strong>
              </div>
            </div>
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
              <h2>What it costs.</h2>
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
            died. So I built the thing I kept wishing existed.”
          </blockquote>
          <p>Ujjawal Asthana · founder, Joon · ex-founder, Zymrat</p>
        </section>

        <section className="a2-final">
          <AmbientField />
          <div>
            <p className="a2-kicker">The first stores</p>
            <h2>We are taking on the first few stores.</h2>
            <p>
              Each store&apos;s measurement starts when it joins. Nothing on this page is presented
              as a merchant result yet—that is what the first stores are for.
            </p>
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
