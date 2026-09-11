import { Rise } from "../v2/Clock";

export function JourneySection() {
  const nodes = [
    ["Trigger", "Checkout started", ""],
    ["Wait", "3 hours", ""],
    ["Condition", "Has made a purchase?", ""],
    ["Silence", "Leave alone", "bought already · logged"],
    ["Holdout", "15% held back", "per entrant · deterministic"],
    ["Send email", "In your voice", "from BrandProfile"],
  ] as const;
  return (
    <section className="v3-after">
      <div className="v2-wrap">
        <Rise>
          <div className="v3-after__head">
            <div>
              <p className="v2-eyebrow mono">email journeys</p>
              <h2 className="v2-section__h">Journeys that wait for the right moment.</h2>
              <p className="v2-section__lede">Welcome, abandoned checkout, post-purchase, win-back and reorder. Joon can decide that no email should be sent - and records why.</p>
            </div>
          </div>
          <div className="v3-journey__flow" aria-label="Illustrative abandoned-checkout email journey">
            {nodes.map(([kind, title, detail], index) => (
              <div className="v3-journey__step" key={kind}>
                {index > 0 && <i aria-hidden="true">→</i>}
                <article className={kind === "Silence" ? "is-silent" : kind === "Send email" ? "is-send" : ""}>
                  <span className="mono">{kind}</span>
                  <strong>{title}</strong>
                  {detail && <small>{detail}</small>}
                </article>
              </div>
            ))}
          </div>
          <div className="v3-left-alone">
            <strong>Left alone, and why</strong>
            <span>Priya · bought 2h ago <b>already purchased</b></span>
            <span>Dev · 3 emails this week <b>fatigue cap</b></span>
            <span>Nisha · 22:40 local <b>quiet hours · sends 07:00</b></span>
          </div>
          <p className="v3-illustrative mono">Conceptual decision outcome - not shown as a draggable editor node.</p>
        </Rise>
      </div>
    </section>
  );
}

export function SharperDecisions() {
  const states = [
    ["General rule", "A recent buyer is unlikely to need a discount.", "Estimate"],
    [
      "Your store's evidence",
      "Rohan returns without being asked, but uses a code when offered one.",
      "Store evidence",
    ],
    [
      "Measured against control",
      "His untreated purchases establish what would have happened anyway.",
      "Measured",
    ],
  ] as const;
  return (
    <section className="v2-section v3-sharper">
      <div className="v2-wrap">
        <Rise className="v3-sharper__copy">
          <p className="v2-eyebrow mono">more campaigns, sharper decisions</p>
          <h2 className="v2-section__h">Day one, a control. Month three, your own evidence.</h2>
          <p className="v2-section__lede">
            The first campaigns use careful general rules. Every campaign after that can use what
            your store has observed - who returned without being asked, who only bought on a code,
            who needed a nudge and who needed nothing.
          </p>
          <p className="v3-sharper__rule">
            The control group is what turns one campaign into evidence the next campaign can use.
          </p>
        </Rise>
        <div className="v3-sharper__states">
          {states.map(([label, copy, confidence], index) => (
            <Rise className="v3-sharper__state" delay={index * 0.08} key={label}>
              <span className="mono">{label}</span>
              <div className="v3-customer">
                <i aria-hidden="true">{index + 1}</i>
                <div>
                  <strong>Rohan</strong>
                  <small>repeat customer · high value</small>
                </div>
              </div>
              <p>{copy}</p>
              <footer>
                <span>Evidence</span>
                <b>{confidence}</b>
              </footer>
            </Rise>
          ))}
        </div>
        <p className="v3-illustrative mono">
          Illustrative decision progression. Estimates remain labelled until enough control
          observations exist.
        </p>
      </div>
    </section>
  );
}

export function FormsSection() {
  return (
    <section className="v2-section v2-section--alt v3-forms">
      <div className="v2-wrap v2-half v2-half--art-right">
        <Rise className="v2-half__copy">
          <p className="v2-eyebrow mono">restraint at the front door</p>
          <h2 className="v2-section__h">
            Grow the list. <em>Don&rsquo;t pay twice for the same customer.</em>
          </h2>
          <p className="v2-section__lede">
            Popups, flyouts, bars and hosted pages, with consent wording set per market. If someone
            is already on your list or bought last week, they do not get another discount code.
          </p>
          <p className="v2-half__aside mono">email and phone consent stay separate</p>
        </Rise>
        <Rise className="v2-half__art">
          <div className="v3-forms__visual">
            <article className="v3-popup">
              <span className="mono">VANA · welcome</span>
              <h3>10% off your first order</h3>
              <p>Join for considered edits and occasional offers.</p>
              <label>
                Email address<div>you@example.com</div>
              </label>
              <span className="v3-popup__check">□ Yes, email me offers and updates.</span>
              <button type="button">Get my code</button>
            </article>
            <article className="v3-code-held">
              <i />
              <span className="mono">incentive decision</span>
              <strong>Code held</strong>
              <p>Already subscribed or bought recently. No new discount issued.</p>
            </article>
          </div>
        </Rise>
      </div>
      <p className="v2-wrap v3-illustrative mono">Illustrative form and incentive decision.</p>
    </section>
  );
}

export function ChannelsStrip() {
  return (
    <section className="v3-channels" id="channels">
      <div className="v2-wrap">
        <strong>Email today. WhatsApp, SMS and RCS coming.</strong>
        <p>The decision layer underneath already works with all three.</p>
      </div>
    </section>
  );
}
