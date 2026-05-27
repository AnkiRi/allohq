import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import "./landing.css";
import { LandingMotion } from "./LandingMotion";
import { ApplyForm } from "./ApplyForm";

export default async function HomePage() {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  // agent.allohq.ai — skip landing, go straight to app (unchanged)
  if (host.startsWith("agent.")) {
    const { userId } = await auth();
    if (userId) {
      redirect("/dashboard");
    } else {
      redirect("/sign-in");
    }
  }

  return <LandingPage />;
}

function LandingPage() {
  const agentUrl =
    process.env.NODE_ENV === "production"
      ? "https://agent.allohq.ai"
      : "http://localhost:3000";

  return (
    <div className="allo-landing aurora-light">
      <header>
        <div className="shell">
          <nav className="nav">
            <span className="brand">allo</span>
            <div className="links">
              <Link href="#briefing">Product</Link>
              <Link href="#how">Customers</Link>
              <Link href={`${agentUrl}/sign-in`} className="sign-in">
                Sign in
              </Link>
            </div>
          </nav>

          <section className="hero">
            <div className="hero-text">
              <p className="eyebrow">customer concierge · for e-commerce</p>
              <h1>
                One marketer<br />
                for every<br />
                <em className="with-mark">customer.</em>
              </h1>
              <p className="lede">
                allo connects to your store, learns your brand, and attends to
                every customer one by one — across email, WhatsApp, and SMS.
              </p>
              <p className="for-instance">
                Drafts before sunrise. Approvals over coffee.
              </p>
              <div className="cta-row">
                <Link href={`${agentUrl}/sign-up`} className="cta-primary">
                  Start free <span className="arrow">→</span>
                </Link>
                <Link href="#how" className="cta-secondary">
                  See how it works
                </Link>
              </div>
            </div>

            <aside className="hero-visual" aria-hidden="true">
              <div className="aurora-orb aurora-orb-a" />
              <div className="aurora-orb aurora-orb-b" />

              <div className="hero-activity">
                <header className="ha-head">
                  <span className="ha-dot" />
                  <span className="ha-label">allo · live</span>
                  <span className="ha-stamp" data-now>—</span>
                </header>

                <div className="ha-kpi">
                  <div className="ha-kpi-row">
                    <span
                      className="ha-kpi-val"
                      data-counter
                      data-target="48213"
                      data-prefix="$"
                    >
                      $0
                    </span>
                    <span className="ha-kpi-delta">↗ +28%</span>
                  </div>
                  <div className="ha-kpi-label">revenue · last 30 days</div>
                  <svg className="ha-spark" viewBox="0 0 240 28" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="sparkGrad" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="#5C9D7E" />
                        <stop offset="100%" stopColor="#1F7A4F" />
                      </linearGradient>
                    </defs>
                    <path
                      className="ha-spark-path"
                      d="M0,22 C20,21 30,18 50,17 C70,16 80,14 100,13 C120,12 140,8 160,7 C180,6 200,3 240,1"
                      fill="none"
                      stroke="url(#sparkGrad)"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                <div className="ha-divider" />

                <div className="ha-items">
                  <div className="ha-item">
                    <div className="ha-text">
                      Drafted a win-back note to <em>Priya Sharma</em>
                    </div>
                    <div className="ha-meta">whatsapp · variant a · 3s ago</div>
                  </div>
                  <div className="ha-item">
                    <div className="ha-text">
                      Refreshed RFM scores for <em>287 customers</em>
                    </div>
                    <div className="ha-meta">overnight batch · 12s ago</div>
                  </div>
                  <div className="ha-item">
                    <div className="ha-text">
                      Held back <em>12 sends</em> · fatigue threshold reached
                    </div>
                    <div className="ha-meta">governor · 24s ago</div>
                  </div>
                  <div className="ha-item">
                    <div className="ha-text">
                      Welcomed <em>4 new customers</em>
                    </div>
                    <div className="ha-meta">welcome series · 38s ago</div>
                  </div>
                </div>

                <div className="ha-divider" />

                <div className="ha-draft">
                  <div className="ha-draft-head">
                    <span className="ha-draft-channel">
                      <span className="ha-draft-channel-dot" />
                      now drafting · whatsapp
                    </span>
                    <span className="ha-draft-to" data-typewriter-to>to priya</span>
                  </div>
                  <div className="ha-draft-bubble">
                    <span data-typewriter />
                    <span className="ha-draft-cursor">▍</span>
                  </div>
                </div>
              </div>
            </aside>
          </section>

          <div className="founding">
            <div className="founding-meta">
              <p className="founding-eyebrow">now onboarding · founding cohort</p>
              <h3 className="founding-headline">
                Five founding partners.<br />
                <em>Shape allo with us.</em>
              </h3>
              <p className="founding-sub">
                White-glove onboarding. Weekly calls with the founders.
                Founding-partner pricing forever.
              </p>
            </div>

            <div className="founding-spots">
              <div className="founding-spots-row" aria-label="3 of 8 spots filled">
                <span className="spot filled" />
                <span className="spot filled" />
                <span className="spot filled" />
                <span className="spot is-next" />
                <span className="spot" />
                <span className="spot" />
                <span className="spot" />
                <span className="spot" />
              </div>
              <div className="founding-spots-meta">
                <span>
                  <strong>3</strong> of 8 onboarded · 5 spots left
                </span>
                <Link href="#apply" className="founding-cta">
                  Apply <span className="arrow">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Briefing section */}
      <section className="section-briefing" id="briefing">
        <div className="shell">
          <div className="head">
            <p className="eyebrow">every morning</p>
            <h2>
              A one-page brief.<br />
              <em>Everything allo did overnight.</em>
            </h2>
            <p>
              What&apos;s at risk, what&apos;s queued for your approval, what
              to act on. A daily artifact you actually want to read —
              printable, shareable, on your phone before the first coffee.
            </p>
          </div>

          <div className="briefing-card">
            <div className="briefing-card-inner">
              <div>
                <div className="meta">
                  <span data-today>Today&apos;s briefing</span>
                </div>
                <div className="lead">
                  Good morning, Ashley.<br />
                  <em>187 customers haven&apos;t visited in a while.</em>
                </div>
                <p className="body-copy">
                  Last spring&apos;s seasonal cohort — the ones who bought
                  during the March linen drop. ₹4.2L of past revenue, mostly
                  bought once. I&apos;ve drafted a 3-variant WhatsApp
                  win-back — expected recovery ₹1.2L.
                </p>
                <div className="cta-row">
                  <button className="btn-primary" type="button">
                    Review draft
                  </button>
                  <Link href="#" className="btn-link">
                    Read full briefing →
                  </Link>
                </div>
              </div>
              <div className="kpis">
                <div className="kpi-row">
                  <span className="kpi-label">Revenue · 30d</span>
                  <span className="kpi-value">$48,213</span>
                  <span className="kpi-delta up">+28%</span>
                </div>
                <div className="kpi-row">
                  <span className="kpi-label">Customers</span>
                  <span className="kpi-value">4,892</span>
                  <span className="kpi-delta">—</span>
                </div>
                <div className="kpi-row">
                  <span className="kpi-label">At risk</span>
                  <span className="kpi-value">187</span>
                  <span className="kpi-delta down">−12%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Evidence — three customer-level proofs, 3 'moment' cards */}
      <section className="section-evidence">
        <div className="shell">
          <div className="head">
            <p className="eyebrow">one marketer for every customer</p>
            <h2>How <em>allo notices.</em></h2>
          </div>
          <div className="moments">
            <article className="moment">
              <div className="moment-meta">
                <span className="num">01</span>
                <span className="dot" />
                <span>memory</span>
                <span className="stamp">held back</span>
              </div>
              <p className="moment-body">
                Priya bought a linen tunic in March.{" "}
                <em>allo</em> won&apos;t pitch her wool in October.
              </p>
              <div className="moment-tag">noticed · kept her on the list</div>
            </article>
            <article className="moment">
              <div className="moment-meta">
                <span className="num">02</span>
                <span className="dot" />
                <span>pre-emptive</span>
                <span className="stamp">06:14 am</span>
              </div>
              <p className="moment-body">
                Reema&apos;s order shipped late last month.{" "}
                <em>allo</em> writes the apology before she does.
              </p>
              <div className="moment-tag">noticed · drafted for your sign-off</div>
            </article>
            <article className="moment">
              <div className="moment-meta">
                <span className="num">03</span>
                <span className="dot" />
                <span>timing</span>
                <span className="stamp">00:14 am</span>
              </div>
              <p className="moment-body">
                Karan reads email at midnight, not 9am.{" "}
                <em>allo</em> writes him at midnight.
              </p>
              <div className="moment-tag">noticed · delivered on his clock</div>
            </article>
          </div>
        </div>
      </section>

      {/* Founder quotes — dark emerald crossfade carousel */}
      <section className="section-quotes">
        <div className="shell">
          <div className="quote-stack" data-quote-stack>
            <figure className="pull-quote is-active" data-quote="0">
              <span className="quote-mark" aria-hidden="true">&ldquo;</span>
              <blockquote>
                At Zymrat, the moment I stopped writing every email myself
                was the moment retention died. allo would have given me back
                my Sundays.
              </blockquote>
              <figcaption>
                <span className="attr-name">Ujjawal Asthana</span>
                <span className="attr-role">ex-founder · Zymrat</span>
              </figcaption>
            </figure>
            <figure className="pull-quote" data-quote="1">
              <span className="quote-mark" aria-hidden="true">&ldquo;</span>
              <blockquote>
                Most retention tools assume you already have a team. allo
                assumes you don&apos;t — and that&apos;s exactly what every
                DTC brand under ten people needs.
              </blockquote>
              <figcaption>
                <span className="attr-name">Raviraj R</span>
                <span className="attr-role">CRM &amp; Growth Lead · HealthifyMe</span>
              </figcaption>
            </figure>
          </div>
          <div className="quote-dots" data-quote-dots>
            <button
              className="quote-dot is-active"
              data-go="0"
              aria-label="Show first quote"
            />
            <button
              className="quote-dot"
              data-go="1"
              aria-label="Show second quote"
            />
          </div>
        </div>
      </section>

      <section className="section-how" id="how">
        <div className="shell">
          <div className="head">
            <p className="eyebrow">how it works</p>
            <h2>Three steps. <em>Live by lunch.</em></h2>
          </div>
          <div className="grid">
            <article className="step">
              <span className="num">01</span>
              <h3>Connect</h3>
              <p>
                One click into Shopify. allo reads your customer and order
                data and sets up your retention system in minutes.
              </p>
              <span className="accent" />
            </article>
            <article className="step">
              <span className="num">02</span>
              <h3>Learn</h3>
              <p>
                allo studies your existing emails, product pages, and past
                campaigns. Within a day, it writes in your voice — warm,
                concise, you.
              </p>
              <span className="accent" />
            </article>
            <article className="step">
              <span className="num">03</span>
              <h3>Attend</h3>
              <p>
                For each customer, allo decides what to say, when, and on
                which channel — then drafts the message and queues it for
                your approval, or ships autonomously.
              </p>
              <span className="accent" />
            </article>
          </div>
        </div>
      </section>

      {/* Apply form — 3 questions, mailto submit */}
      <section className="section-apply" id="apply">
        <div className="shell">
          <div className="head">
            <p className="eyebrow">founding cohort · application</p>
            <h2>
              Three questions.<br />
              <em>We read every one.</em>
            </h2>
            <p>If you&apos;re a fit, we&apos;ll write back within 48 hours.</p>
          </div>
          <ApplyForm />
        </div>
      </section>

      <section className="section-cta" id="cta">
        <div className="shell">
          <h2>
            Try allo with your store.<br />
            <em>Free for 14 days.</em>
          </h2>
          <p>
            Connect Shopify in one click. allo writes your first campaign
            before you finish your coffee.
          </p>
          <div className="cta-row">
            <Link href={`${agentUrl}/sign-up`} className="btn-pill">
              Start free
            </Link>
            <Link href="#" className="btn-link">
              Book a 15-minute walkthrough
            </Link>
          </div>
        </div>
      </section>

      <footer className="footer-taste">
        <div className="shell">
          <div className="row">
            <div className="col">
              hand-built in bangalore
              <span className="meta">© 2026 AlloHQ</span>
            </div>
            <div className="col">
              made for founders<br />who write their own emails
            </div>
            <div className="col links">
              <Link href="#">Product</Link>
              <Link href="#">Pricing</Link>
              <Link href="#">Customers</Link>
              <Link href="#">Brand</Link>
              <Link href="#">Privacy</Link>
            </div>
          </div>
        </div>
      </footer>

      <LandingMotion />
    </div>
  );
}
