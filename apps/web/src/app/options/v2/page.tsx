import type { Metadata } from "next";
import Link from "next/link";
import "./v2.css";
import {
  ReasoningReveal,
  ATTENTION_STORIES,
} from "@/components/console/ReasoningReveal";
import { PaletteSwitcher } from "./Switcher";
import { KineticHeadline } from "./Kinetic";
import { HoldoutField } from "./Holdout";
import { SwarmField } from "./Swarm";
import { MorningBrief } from "./Brief";
import { BillStatement } from "./Bill";
import {
  DayRail,
  SkyWash,
  NowClock,
  DayHand,
  Event,
  Rise,
  ConsoleClock,
} from "./Clock";

export const metadata: Metadata = {
  title: "allo · one marketer for every customer",
  description:
    "allo runs retention and first-line customer service for consumer brands, across email, WhatsApp and SMS, on your own accounts. It holds out a control on every campaign and only bills on the lift that control proves is real.",
};

/**
 * No-FOUC palette resolver. Runs synchronously before the page paints and sets
 * data-pal on the .opt-v2 root. Resolution order: ?pal= URL query → stored
 * localStorage('allo-theme') → SSR default (drenched). The key is shared with
 * the app's ThemeProvider, so a palette picked on the landing carries into the
 * app (and back). So a palette can be linked / screenshotted directly, a
 * returning visitor never flashes the default, and the choice survives a reload.
 */
const PAL_INIT = `
(function(){
  try {
    var ok = function(p){ return p==="drenched"||p==="light"||p==="dark"; };
    var pal = null;
    var q = new URLSearchParams(location.search).get("pal");
    if (ok(q)) { pal = q; }
    else {
      var s = localStorage.getItem("allo-theme");
      if (ok(s)) pal = s;
    }
    if (!pal) return;
    var sc = document.currentScript;
    var el = (sc && sc.parentElement) || document.querySelector(".opt-v2");
    if (el) el.setAttribute("data-pal", pal);
  } catch (e) {}
})();
`;

const signUp = "http://localhost:3000/sign-up";
const signIn = "http://localhost:3000/sign-in";

type PalId = "drenched" | "light" | "dark";
function isPal(v: unknown): v is PalId {
  return v === "drenched" || v === "light" || v === "dark";
}

/**
 * The V2 landing BODY as a reusable component. Rendered both at /options/v2
 * (with the prototype label banner) and at the production root / (no banner).
 *
 * - showBanner: render the "DESIGN OPTION…" prototype banner + "← all options"
 *   link. Off for the production / route.
 * - initialPal: SSR palette so a linked/screenshotted palette is correct in the
 *   first byte. Defaults to "drenched". The no-FOUC PAL_INIT script + the
 *   Switcher's mount effect still handle ?pal= / localStorage for visitors.
 *
 * The visitor-facing palette switcher (Drenched / Light / Dark) always renders
 * in the nav — it is the landing's theme control, independent of the banner.
 */
export function V2Landing({
  showBanner = true,
  initialPal = "drenched",
}: {
  showBanner?: boolean;
  initialPal?: PalId;
}) {
  return (
    <div className="opt-v2" data-pal={initialPal}>
      {/* No-FOUC: resolve ?pal= / stored palette synchronously, before paint. */}
      <script dangerouslySetInnerHTML={{ __html: PAL_INIT }} />

      {/* Fonts: Hanken Grotesk (display + body) · JetBrains Mono (data/console) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500;1,600&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
      />

      {/* ── prototype label banner — /options/v2 only ──────────── */}
      {showBanner && (
        <div className="v2-banner" role="note">
          <span className="v2-banner__label mono">
            DESIGN OPTION · synthesis, best elements, three palettes
          </span>
          <Link className="v2-banner__back mono" href="/options">
            ← all options
          </Link>
        </div>
      )}

      <div className="v2-shell">
        {/* ── 1 · NAV ──────────────────────────────────────────── */}
        <header className="v2-nav">
          <div className="v2-wrap v2-nav__inner">
            <a className="v2-brand" href="#top">
              <span className="v2-blip" aria-hidden="true" />
              <span className="v2-brand__word">allo</span>
            </a>
            <nav className="v2-nav__links mono" aria-label="Primary">
              <a href="#brief">the brief</a>
              <a href="#proof">proof</a>
              <a href="#bill">pricing</a>
              <a href="#how">how it works</a>
            </nav>
            <div className="v2-nav__right">
              <PaletteSwitcher />
              <a className="v2-btn v2-btn--primary" href={signUp}>
                Start free
              </a>
            </div>
          </div>
        </header>

        <main id="top">
          {/* ── 2 · HERO — full-bleed: thesis + console + proof strip ── */}
          <section className="v2-hero">
            <div className="v2-hero__aura" aria-hidden="true" />
            <div className="v2-wrap v2-hero__grid">
              <div className="v2-hero__lead">
                <p className="v2-hero__stance mono">
                  <span className="v2-hero__stance-dot" aria-hidden="true" />
                  outcome-priced retention · built for commerce, from india
                </p>
                <KineticHeadline />
                <p className="v2-hero__sub">
                  allo connects to your store, learns your brand, and attends to
                  every customer one at a time, across email, WhatsApp and
                  SMS, on your own accounts.
                </p>
                <div className="v2-hero__cta">
                  <a className="v2-btn v2-btn--primary v2-btn--lg" href={signUp}>
                    Start free <span aria-hidden="true">→</span>
                  </a>
                  <span className="v2-hero__cta-note mono">
                    connect Shopify in one click
                  </span>
                </div>

                {/* slim live proof strip */}
                <dl className="v2-proofstrip mono" aria-label="Live store, right now">
                  <div className="v2-proofstrip__cell v2-proofstrip__cell--live">
                    <span className="v2-live-dot" aria-hidden="true" />
                    <dd className="v2-accent">live</dd>
                  </div>
                  <div className="v2-proofstrip__cell">
                    <dt>customers</dt>
                    <dd>4,820</dd>
                  </div>
                  <div className="v2-proofstrip__cell">
                    <dt>revenue · 30d</dt>
                    <dd>
                      ₹48,213 <span className="v2-accent">↗ +28%</span>
                    </dd>
                  </div>
                  <div className="v2-proofstrip__cell">
                    <dt>at risk</dt>
                    <dd>187</dd>
                  </div>
                </dl>
                <p className="v2-proofstrip__note mono">
                  Figures representative while control measurement is wired up.
                </p>
              </div>

              {/* the operator console — elevated ReasoningReveal surface */}
              <div className="v2-console" aria-label="allo operator console">
                <div className="v2-console__bar">
                  <span className="v2-lamp" aria-hidden="true" />
                  <span className="v2-lamp" aria-hidden="true" />
                  <span className="v2-lamp is-live" aria-hidden="true" />
                  <span className="v2-console__title mono">allo · operator</span>
                  <span className="v2-console__status mono" aria-hidden="true">
                    <span className="v2-live-dot" /> attending
                  </span>
                  <ConsoleClock />
                </div>
                <div className="v2-console__body">
                  <ReasoningReveal stories={ATTENTION_STORIES} />
                </div>
                <div className="v2-console__foot mono" aria-hidden="true">
                  <span>reasoning · live</span>
                  <span>email · whatsapp · sms</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── 3 · MORNING BRIEF — HALF page, visual-LEFT ─────────── */}
          <section className="v2-section" id="brief">
            <div className="v2-wrap v2-half v2-half--art-left">
              <Rise className="v2-half__art">
                <MorningBrief />
              </Rise>
              <Rise className="v2-half__copy">
                <p className="v2-eyebrow mono">the morning brief</p>
                <h2 className="v2-section__h">
                  Drafts before sunrise. <em>Approvals over coffee.</em>
                </h2>
                <p className="v2-section__lede">
                  You wake up; allo already worked. One short note of what it did
                  overnight: who&rsquo;s slipping, what it drafted in your
                  voice, what it held back. Read it, approve a line, finish your
                  coffee.
                </p>
                <p className="v2-half__aside mono">
                  // nothing ships over your head · every line waits for your nod
                </p>
              </Rise>
            </div>
          </section>

          {/* ── 4 · SWARM — HALF page, visual-RIGHT ────────────────── */}
          <section className="v2-section v2-section--alt">
            <div className="v2-wrap v2-half v2-half--art-right">
              <Rise className="v2-half__copy">
                <p className="v2-eyebrow mono">one marketer for every customer</p>
                <h2 className="v2-section__h">
                  4,820 customers. <em>Not one undifferentiated blast.</em>
                </h2>
                <p className="v2-section__lede">
                  A human marketer can attend to a handful, so the rest get a
                  blast. allo attends to each one. The crowd sorts into who
                  they actually are, then narrows to the single person worth
                  reaching today.
                </p>
                <p className="v2-half__aside mono">
                  // lapsed · loyal · at risk · new · every one a person, not a row
                </p>
              </Rise>
              <Rise className="v2-half__art">
                <div className="v2-swarm-frame">
                  <SwarmField />
                </div>
              </Rise>
            </div>
          </section>

          {/* ── 5 · HOLDOUT — HALF page, visual-LEFT ───────────────── */}
          <section className="v2-section" id="proof">
            <div className="v2-wrap v2-half v2-half--art-left v2-half--wide-art">
              <Rise className="v2-half__art">
                <div className="v2-proof-card">
                  <HoldoutField />
                </div>
              </Rise>
              <Rise className="v2-half__copy">
                <p className="v2-eyebrow mono">proven, not claimed</p>
                <h2 className="v2-section__h">
                  It attends to each one. <em>And it can prove it.</em>
                </h2>
                <p className="v2-section__lede">
                  On every campaign allo holds a few back, matched on past spend
                  and left untouched. The worked group lifts above that held-back
                  baseline, so the lift you pay on is measured against a control,
                  never claimed.
                </p>
                <p className="v2-half__aside">
                  Holdouts are one-way: you can&rsquo;t run a control on history.
                  Every campaign that runs without one loses that proof forever.
                </p>
              </Rise>
            </div>
          </section>

          {/* ── 6 · ON THE CLOCK — full, scroll-scrub day rail ─────── */}
          <section className="v2-section v2-section--alt v2-day" id="day">
            <div className="v2-wrap">
              <Rise className="v2-section__head v2-section__head--center">
                <p className="v2-eyebrow mono">a day, on the clock</p>
                <h2 className="v2-section__h">
                  One operator, attending all day. <em>Each move at its hour.</em>
                </h2>
                <p className="v2-section__lede">
                  One customer at a time, each decision posting at the
                  real hour it happens. Scroll the day forward.
                </p>
              </Rise>
            </div>

            <DayRail>
              <SkyWash />
              <div className="v2-wrap v2-rail__inner">
                <NowClock />
                <div className="v2-track" aria-hidden="true">
                  <span className="v2-track__line" />
                  <DayHand />
                </div>
                <ol className="v2-events">
                  <li>
                    <Event hour={5} className="v2-event">
                      <div className="v2-event__row">
                        <div className="v2-event__time">
                          <span className="v2-event__clock mono">05:00</span>
                          <span className="v2-event__phase mono">pre-dawn</span>
                        </div>
                        <div className="v2-event__body">
                          <span className="v2-lampdot" aria-hidden="true" />
                          <h3 className="v2-event__act">
                            Drafts written while you sleep.
                          </h3>
                          <p className="v2-event__detail">
                            allo segments overnight and writes the day&rsquo;s
                            sends in your voice, queued, not sent.
                          </p>
                          <p className="v2-event__meta mono">
                            3 drafts queued · awaiting sign-off
                          </p>
                        </div>
                      </div>
                    </Event>
                  </li>
                  <li>
                    <Event hour={8} className="v2-event">
                      <div className="v2-event__row">
                        <div className="v2-event__time">
                          <span className="v2-event__clock mono">08:00</span>
                          <span className="v2-event__phase mono">morning</span>
                        </div>
                        <div className="v2-event__body">
                          <span className="v2-lampdot" aria-hidden="true" />
                          <h3 className="v2-event__act">
                            Approvals over coffee.
                          </h3>
                          <p className="v2-event__detail">
                            One page of what&rsquo;s queued. Approve, hold, or
                            edit. Nothing ships over your head.
                          </p>
                          <p className="v2-event__meta mono">
                            2 approved · 1 held for a tweak
                          </p>
                        </div>
                      </div>
                    </Event>
                  </li>
                  <li>
                    <Event hour={9} className="v2-event">
                      <div className="v2-event__row">
                        <div className="v2-event__time">
                          <span className="v2-event__clock mono">09:00</span>
                          <span className="v2-event__phase mono">restraint</span>
                        </div>
                        <div className="v2-event__body">
                          <span className="v2-lampdot" aria-hidden="true" />
                          <h3 className="v2-event__act">
                            <span className="v2-who">Priya</span>: linen, not
                            wool. Left alone.
                          </h3>
                          <p className="v2-event__detail">
                            She bought a linen tunic in March. allo won&rsquo;t
                            pitch her October&rsquo;s woollens, kept on the
                            list, the 9am blast left alone.
                          </p>
                          <p className="v2-event__meta mono">
                            decision · no send · restraint
                          </p>
                        </div>
                      </div>
                    </Event>
                  </li>
                  <li>
                    <Event hour={16.5} className="v2-event">
                      <div className="v2-event__row">
                        <div className="v2-event__time">
                          <span className="v2-event__clock mono">16:30</span>
                          <span className="v2-event__phase mono">afternoon</span>
                        </div>
                        <div className="v2-event__body">
                          <span className="v2-lampdot" aria-hidden="true" />
                          <h3 className="v2-event__act">
                            <span className="v2-who">Reema</span>: Triphala
                            running low.
                          </h3>
                          <p className="v2-event__detail">
                            A gentle reorder nudge, timed to her cycle, not a
                            Tuesday blast. Queued for your sign-off.
                          </p>
                          <p className="v2-event__meta mono">
                            replenishment · timed to her
                          </p>
                        </div>
                      </div>
                    </Event>
                  </li>
                  <li>
                    <Event hour={19} className="v2-event">
                      <div className="v2-event__row">
                        <div className="v2-event__time">
                          <span className="v2-event__clock mono">19:00</span>
                          <span className="v2-event__phase mono">dusk</span>
                        </div>
                        <div className="v2-event__body">
                          <span className="v2-lampdot" aria-hidden="true" />
                          <h3 className="v2-event__act">
                            The Diwali win-back goes out.
                          </h3>
                          <p className="v2-event__detail">
                            187 lapsed buyers reached across their own channels,
                            with{" "}
                            <span className="v2-noticed">22 held back</span> as a
                            control, so the lift is proven, not claimed.
                          </p>
                          <p className="v2-event__meta v2-event__meta--control mono">
                            held back 22 as control · lift measured
                          </p>
                        </div>
                      </div>
                    </Event>
                  </li>
                  <li>
                    <Event hour={24} className="v2-event">
                      <div className="v2-event__row">
                        <div className="v2-event__time">
                          <span className="v2-event__clock mono">00:00</span>
                          <span className="v2-event__phase mono">midnight</span>
                        </div>
                        <div className="v2-event__body">
                          <span className="v2-lampdot" aria-hidden="true" />
                          <h3 className="v2-event__act">
                            <span className="v2-who">Karan</span> reads at
                            midnight.
                          </h3>
                          <p className="v2-event__detail">
                            Not at 9am. allo left the blast alone and writes him
                            when he&rsquo;s actually reading.
                          </p>
                          <p className="v2-event__meta mono">
                            timing · sent on his clock
                          </p>
                        </div>
                      </div>
                    </Event>
                  </li>
                </ol>
              </div>
            </DayRail>
          </section>

          {/* ── 7 · THE BILL — HALF page, visual-RIGHT ─────────────── */}
          <section className="v2-section" id="bill">
            <div className="v2-wrap v2-half v2-half--art-right v2-half--wide-art">
              <Rise className="v2-half__copy">
                <p className="v2-eyebrow mono">base + performance</p>
                <h2 className="v2-section__h">
                  A bill you can read <em>line by line.</em>
                </h2>
                <p className="v2-section__lede">
                  A base fee to run retention, charged either way. Then a
                  performance fee read straight off the held-out control, a
                  share of the proven lift. Never your gross. Never a take-rate we
                  picked.
                </p>
                <p className="v2-half__aside mono">
                  Figures representative while control measurement is wired up.
                </p>
              </Rise>
              <Rise className="v2-half__art">
                <BillStatement />
              </Rise>
            </div>
          </section>

          {/* ── 8 · HOW IT WORKS — connect / learn / attend cards ──── */}
          <section className="v2-section v2-section--alt" id="how">
            <div className="v2-wrap">
              <Rise className="v2-section__head">
                <p className="v2-eyebrow mono">connect · learn · attend</p>
                <h2 className="v2-section__h">
                  It does the job, not <em>&ldquo;a tool to do the job.&rdquo;</em>
                </h2>
                <p className="v2-section__lede">
                  You type a goal in plain language. allo works the way a careful
                  marketer would, out loud, before a single message sends.
                </p>
              </Rise>
              <ol className="v2-steps">
                <Rise className="v2-step">
                  <span className="v2-step__k mono">$ allo connect</span>
                  <h3 className="v2-step__h">It reads your store.</h3>
                  <p className="v2-step__p">
                    One click into Shopify and your own email, WhatsApp and SMS.
                    allo scans <strong>4,820</strong> customers and finds the{" "}
                    <strong>187</strong> lapsed buyers worth reaching, about{" "}
                    <strong>₹4.2L</strong> in past revenue.
                  </p>
                </Rise>
                <Rise className="v2-step" delay={0.08}>
                  <span className="v2-step__k mono">$ allo learn</span>
                  <h3 className="v2-step__h">It holds out a control first.</h3>
                  <p className="v2-step__p">
                    From the 187, allo holds back <strong>22</strong>, matched on
                    past spend, and leaves them untouched. Everything next is
                    measured against them, proven, not assumed.
                  </p>
                </Rise>
                <Rise className="v2-step" delay={0.16}>
                  <span className="v2-step__k mono">$ allo attend</span>
                  <h3 className="v2-step__h">It writes, then waits for your nod.</h3>
                  <p className="v2-step__p">
                    allo drafts <strong>3</strong> win-back variants in your
                    voice and predicts the outcome before you approve:{" "}
                    <strong>₹1.2L</strong> expected recovery, a named downside,
                    and a confidence.
                  </p>
                </Rise>
              </ol>

              {/* consequence prediction — upside / NAMED downside / confidence */}
              <Rise>
                <div className="v2-consequence">
                  <div className="v2-consequence__head">
                    <span className="v2-consequence__tag">
                      What allo shows before you approve
                    </span>
                    <span className="v2-consequence__est mono">
                      Estimate · not yet measured
                    </span>
                  </div>
                  <div className="v2-consequence__grid">
                    <div className="v2-consequence__cell v2-consequence__cell--up">
                      <span className="v2-consequence__k mono">
                        Expected upside
                      </span>
                      <span className="v2-consequence__v">₹1.2L recovered</span>
                      <span className="v2-consequence__d">
                        lift vs the 22 held-back buyers
                      </span>
                    </div>
                    <div className="v2-consequence__cell">
                      <span className="v2-consequence__k mono">
                        Named downside
                      </span>
                      <span className="v2-consequence__v">~0.6% unsubscribe</span>
                      <span className="v2-consequence__d">
                        the risk allo will not hide from you
                      </span>
                    </div>
                    <div className="v2-consequence__cell">
                      <span className="v2-consequence__k mono">Confidence</span>
                      <span className="v2-consequence__v">Moderate</span>
                      <span className="v2-consequence__d">
                        firms up as control data lands
                      </span>
                    </div>
                  </div>
                </div>
              </Rise>
            </div>
          </section>

          {/* ── 9 · POSITIONING band — centered ────────────────────── */}
          <section className="v2-position" aria-label="Positioning">
            <div className="v2-wrap v2-position__inner">
              <Rise>
                <p className="v2-position__eyebrow mono">what allo is</p>
                <p className="v2-position__line">
                  Retention tools give you software and a bill. allo gives you an{" "}
                  <span className="v2-accent">operator</span> that does the work,
                  and only bills on the lift it proves against a control.{" "}
                  <em>You pay for outcomes, not access.</em> Built for commerce,
                  from India.
                </p>
              </Rise>
            </div>
          </section>

          {/* ── 10 · FOUNDER quote ─────────────────────────────────── */}
          <section className="v2-section v2-founder" aria-label="Founder">
            <div className="v2-wrap">
              <Rise className="v2-founder__pane">
                <div className="v2-founder__head mono">
                  // founder · field note
                </div>
                <blockquote className="v2-founder__quote">
                  At Zymrat, the moment I stopped writing every email myself was
                  the moment retention died.{" "}
                  <span className="v2-accent">
                    allo would have given me back my Sundays.
                  </span>
                </blockquote>
                <figcaption className="v2-founder__by mono">
                  <b>Ujjawal Asthana</b> · ex-founder, Zymrat
                </figcaption>
              </Rise>
            </div>
          </section>

          {/* ── 11 · FOUNDING cohort ───────────────────────────────── */}
          <section className="v2-section v2-section--alt" aria-labelledby="cohort-h">
            <div className="v2-wrap">
              <Rise className="v2-cohort">
                <div className="v2-cohort__copy">
                  <h2 id="cohort-h" className="v2-section__h">
                    Five founding partners.{" "}
                    <em>Shape allo with us.</em>
                  </h2>
                  <p className="v2-section__lede">
                    We onboard slowly, on purpose. Each brand&rsquo;s control
                    data starts the day they join, and because holdouts are
                    irreversible, the proof can only be built forward.
                  </p>
                </div>
                <div className="v2-cohort__meter">
                  <div
                    className="v2-cohort__bar"
                    aria-label="3 of 8 spots onboarded"
                  >
                    <span className="v2-cohort__cell is-on" />
                    <span className="v2-cohort__cell is-on" />
                    <span className="v2-cohort__cell is-on" />
                    <span className="v2-cohort__cell is-next" />
                    <span className="v2-cohort__cell" />
                    <span className="v2-cohort__cell" />
                    <span className="v2-cohort__cell" />
                    <span className="v2-cohort__cell" />
                  </div>
                  <p className="v2-cohort__foot mono">
                    <b>3</b> of 8 onboarded · 5 spots left
                  </p>
                </div>
              </Rise>
            </div>
          </section>

          {/* ── 12 · FINAL CTA — command prompt redux ──────────────── */}
          <section className="v2-final" aria-label="Get started">
            <div className="v2-wrap">
              <Rise>
                <p className="v2-final__prompt mono">
                  <span className="v2-accent">allo ❯</span> deploy on my store
                </p>
                <h2 className="v2-final__h">
                  Try allo with your store.{" "}
                  <em>Free for 14 days.</em>
                </h2>
                <p className="v2-final__p">
                  Connect Shopify in one click. allo holds out its first control
                  and writes your first campaign before you finish your coffee.
                </p>
                <div className="v2-final__cta">
                  <a className="v2-btn v2-btn--primary v2-btn--lg" href={signUp}>
                    Start free <span aria-hidden="true">→</span>
                  </a>
                  <a className="v2-final__signin mono" href={signIn}>
                    or sign in
                  </a>
                </div>
              </Rise>
            </div>
          </section>
        </main>

        {/* ── 13 · FOOTER ────────────────────────────────────────── */}
        <footer className="v2-footer">
          <div className="v2-wrap v2-footer__inner mono">
            <span className="v2-footer__brand">hand-built in bangalore</span>
            <span>© 2026 allo</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default async function V2Page({
  searchParams,
}: {
  searchParams: Promise<{ pal?: string | string[] }>;
}) {
  // SSR the palette from ?pal= so a linked/screenshotted palette is correct in
  // the first byte (no hydration reset). localStorage for returning visitors is
  // still handled by the no-FOUC script + the Switcher's mount effect.
  const sp = await searchParams;
  const raw = Array.isArray(sp?.pal) ? sp.pal[0] : sp?.pal;
  const initialPal: PalId = isPal(raw) ? raw : "drenched";

  return <V2Landing showBanner initialPal={initialPal} />;
}
