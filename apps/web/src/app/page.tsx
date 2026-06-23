import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import "./landing.css";
import { LandingMotion } from "./LandingMotion";
import { ReasoningReveal, ATTENTION_STORIES } from "@/components/console/ReasoningReveal";
import { ApplyForm } from "./ApplyForm";
import { ThemeToggle } from "./ThemeToggle";

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

/**
 * Pre-paint theme resolver. Runs synchronously in <head> order before the
 * landing renders, so an explicit override (localStorage "allo-theme") is
 * applied with no flash. With no stored choice it leaves the attribute unset
 * and the CSS `prefers-color-scheme` media query handles the default.
 * Scoped entirely to the landing's `data-allo-theme` attribute on <html> —
 * never touches the app's next-themes `.dark` class.
 */
const THEME_INIT = `
(function(){
  try {
    var t = localStorage.getItem("allo-theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-allo-theme", t);
    }
  } catch (e) {}
})();
`;

function LandingPage() {
  const agentUrl =
    process.env.NODE_ENV === "production"
      ? "https://agent.allohq.ai"
      : "http://localhost:3000";

  const signUp = `${agentUrl}/sign-up`;
  const signIn = `${agentUrl}/sign-in`;

  return (
    <div className="allo-terminal">
      {/* No-FOUC: resolve explicit theme override synchronously before paint */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />

      {/* Fonts: mono for data/commands, grotesk for prose */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
      />

      {/* NAV — single line, 64px */}
      <header className="nav">
        <div
          className="shell"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <span className="nav-brand">
            <span className="blip" aria-hidden="true" />
            allo
          </span>
          <nav className="nav-links">
            <Link href="#brief" className="hide-sm">
              briefing
            </Link>
            <Link href="#notices" className="hide-sm">
              how it notices
            </Link>
            <Link href="#how">how it works</Link>
            <Link href={signIn}>sign in</Link>
            <Link href={signUp} className="nav-cta">
              start free
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* HERO — command prompt + streamed reasoning */}
      <section className="hero">
        <div className="shell">
          <div className="hero-grid">
            <div className="hero-lead">
              <h1>
                One marketer for{" "}
                <span className="accent">every customer.</span>
              </h1>
              <p className="hero-sub">
                allo connects to your store, learns your brand, and attends to
                every customer — across email, WhatsApp, and SMS.
              </p>
              <p className="hero-flourish mono">
                // drafts before sunrise · approvals over coffee
              </p>
              <div className="hero-cta">
                <Link href={signUp} className="btn-primary">
                  Start free <span aria-hidden="true">→</span>
                </Link>
                <Link href="#how" className="btn-ghost">
                  See how it works
                </Link>
                <span className="kbd-hint" aria-hidden="true">
                  <kbd>⌘</kbd>
                  <kbd>K</kbd> to run
                </span>
              </div>
            </div>

            {/* the operator console */}
            <div className="console" aria-label="allo operator console">
              <div className="console-bar">
                <span className="lamp" aria-hidden="true" />
                <span className="lamp" aria-hidden="true" />
                <span className="lamp live" aria-hidden="true" />
                <span className="title mono">allo — operator</span>
                <span className="clock mono" data-clock>
                  00:00:00
                </span>
              </div>
              <div className="console-body">
                {/* The ONE shared reasoning-reveal — identical motion to the app
                    home console (rolling one-customer attention stories). */}
                <ReasoningReveal stories={ATTENTION_STORIES} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATUS STRIP — full-width readout band */}
      <div className="statusbar">
        <div className="shell">
          <div className="statusbar-inner">
            <span className="stat">
              <span className="live-dot" aria-hidden="true" />
              <span className="val accent">live</span>
            </span>
            <span className="stat">
              <span className="label">customers</span>
              <span className="val">4,820</span>
            </span>
            <span className="stat">
              <span className="label">revenue · 30d</span>
              <span className="val">₹48,213</span>
              <span className="val accent">↗ +28%</span>
            </span>
            <span className="stat">
              <span className="label">at risk</span>
              <span className="val">187</span>
              <span className="label">−12%</span>
            </span>
            <span className="stat">
              <span className="label">channels</span>
              <span className="val">email · whatsapp · sms</span>
            </span>
          </div>
        </div>
      </div>

      {/* BRIEFING — the overnight brief, rendered as a console pane */}
      <section className="block" id="brief">
        <div className="shell">
          <div className="block-head">
            <h2>
              Everything allo did <span className="accent">overnight.</span>
            </h2>
            <p>
              A one-page brief of what&apos;s at risk, what&apos;s queued for
              approval, and what to act on — on your phone before the first
              coffee.
            </p>
          </div>

          <div className="brief-pane">
            <div className="brief-statusline mono">
              <span className="live-dot" aria-hidden="true" />
              <span className="accent">briefing</span>
              <span className="sep">·</span>
              <span>
                generated <span data-clock>00:00:00</span>
              </span>
              <span className="sep">·</span>
              <span>4,820 customers</span>
              <span className="sep">·</span>
              <span>₹48,213 / 30d</span>
            </div>

            <div className="brief-grid">
              <div className="brief-msg">
                <div className="stamp mono">to: ashley · re: overnight run</div>
                <p className="greeting">
                  Good morning, Ashley.{" "}
                  <span className="accent">
                    187 customers haven&apos;t visited in a while.
                  </span>
                </p>
                <p>
                  Last spring&apos;s linen-drop cohort — ₹4.2L of past revenue,
                  mostly one-time buyers. I&apos;ve drafted a 3-variant WhatsApp
                  win-back —{" "}
                  <span className="recovery">expected recovery ₹1.2L</span>.
                </p>
                <div className="brief-actions">
                  <button type="button" className="btn-sm">
                    Review draft
                  </button>
                  <Link href="#" className="link-mono">
                    read full briefing →
                  </Link>
                </div>
              </div>

              <div className="brief-kpis">
                <div className="kpi">
                  <span className="kpi-label">revenue · 30d</span>
                  <span className="kpi-line">
                    <span className="kpi-val">₹48,213</span>
                    <span className="kpi-delta up">+28%</span>
                  </span>
                </div>
                <div className="kpi">
                  <span className="kpi-label">customers</span>
                  <span className="kpi-line">
                    <span className="kpi-val">4,820</span>
                    <span className="kpi-delta">—</span>
                  </span>
                </div>
                <div className="kpi">
                  <span className="kpi-label">at risk</span>
                  <span className="kpi-line">
                    <span className="kpi-val">187</span>
                    <span className="kpi-delta down">−12%</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NOTICES — how allo notices, 3 log entries */}
      <section className="block" id="notices" style={{ paddingTop: 0 }}>
        <div className="shell">
          <div className="block-head">
            <h2>
              How allo <span className="accent">notices.</span>
            </h2>
          </div>
          <div className="notices">
            <article className="notice">
              <span className="idx mono">[01]</span>
              <p className="body">
                Priya bought a linen tunic in March. <em>allo</em> won&apos;t
                pitch her wool in October.
              </p>
              <span className="tag mono">
                memory
                <span className="verdict">kept on the list</span>
              </span>
            </article>
            <article className="notice">
              <span className="idx mono">[02]</span>
              <p className="body">
                Reema&apos;s order shipped late. <em>allo</em> writes the apology
                before she does.
              </p>
              <span className="tag mono">
                pre-emptive
                <span className="verdict">drafted for sign-off</span>
              </span>
            </article>
            <article className="notice">
              <span className="idx mono">[03]</span>
              <p className="body">
                Karan reads email at midnight, not 9am. <em>allo</em> writes him
                at midnight.
              </p>
              <span className="tag mono">
                timing
                <span className="verdict">sent on his clock</span>
              </span>
            </article>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — connect / learn / attend */}
      <section className="block" id="how" style={{ paddingTop: 0 }}>
        <div className="shell">
          <div className="block-head">
            <h2>
              Connect. Learn. <span className="accent">Attend.</span>
            </h2>
            <p>
              One operator that reads your store, writes in your voice, and
              decides what to say to each customer — drafting for approval or
              shipping on its own.
            </p>
          </div>
          <div className="pipe">
            <div className="pipe-step">
              <div className="cmd mono">$ allo connect</div>
              <h3>Connect</h3>
              <p>
                One click into Shopify. allo reads your customer and order data
                and stands up your retention system in minutes.
              </p>
            </div>
            <div className="pipe-step">
              <div className="cmd mono">$ allo learn</div>
              <h3>Learn</h3>
              <p>
                It studies your emails and past campaigns, then writes in your
                voice — warm, concise, you.
              </p>
            </div>
            <div className="pipe-step">
              <div className="cmd mono">$ allo attend</div>
              <h3>Attend</h3>
              <p>
                For each customer it decides what to say, when, and which channel
                — drafts for your approval, or ships autonomously.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOUNDER QUOTE */}
      <section className="quote-block">
        <div className="shell">
          <figure className="quote-pane">
            <div className="qhead mono">// founder · field note</div>
            <blockquote>
              At Zymrat, the moment I stopped writing every email myself was the
              moment retention died.{" "}
              <span className="accent">
                allo would have given me back my Sundays.
              </span>
            </blockquote>
            <figcaption className="mono">
              <b>Ujjawal Asthana</b> · ex-founder, Zymrat
            </figcaption>
          </figure>
        </div>
      </section>

      {/* FOUNDING COHORT — meter + apply */}
      <section>
        <div className="shell">
          <div className="cohort">
            <div>
              <h2>
                Five founding partners.{" "}
                <span className="accent">Shape allo with us.</span>
              </h2>
              <p>
                Build the operator alongside us. Founding partners get direct
                input on what allo learns next.
              </p>
            </div>
            <div className="cohort-meter">
              <div className="meter-bar" aria-label="3 of 8 spots onboarded">
                <span className="cell on" />
                <span className="cell on" />
                <span className="cell on" />
                <span className="cell next" />
                <span className="cell" />
                <span className="cell" />
                <span className="cell" />
                <span className="cell" />
              </div>
              <div className="meter-foot mono">
                <span>
                  <b>3</b> of 8 onboarded · 5 spots left
                </span>
                <Link href="#apply" className="apply">
                  apply →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* APPLY — three questions, mailto submit */}
      <section className="apply-block" id="apply">
        <div className="shell">
          <div className="block-head">
            <h2>
              Three questions. <span className="accent">We read every one.</span>
            </h2>
            <p>If you&apos;re a fit, we&apos;ll write back within 48 hours.</p>
          </div>
          <ApplyForm />
        </div>
      </section>

      {/* FINAL CTA — command prompt redux */}
      <section className="final">
        <div className="shell">
          <p className="prompt-line mono">
            <span className="accent">allo ❯</span> deploy on my store
          </p>
          <h2>
            Try allo with your store.{" "}
            <span className="accent">Free for 14 days.</span>
          </h2>
          <p>
            Connect Shopify in one click. allo writes your first campaign before
            you finish your coffee.
          </p>
          <div className="cta-row">
            <Link href={signUp} className="btn-primary">
              Start free <span aria-hidden="true">→</span>
            </Link>
            <Link href="#how" className="btn-ghost">
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="shell">
          <div className="footer-inner">
            <span className="brand">hand-built in bangalore</span>
            <span>© 2026 allo</span>
          </div>
        </div>
      </footer>

      <LandingMotion />
    </div>
  );
}
