import { Rise } from "../v2/Clock";

export function JourneySection() {
  const decisions = [
    ["Day 28", "Inside her usual 45-day rhythm", "Left alone", "She normally buys at full price"],
    ["Day 45", "No order yet", "Watch", "Her usual buying window has just opened"],
    ["Day 60", "15 days later than usual", "Candidate", "A reminder may now be useful"],
    ["Today", "Viewed her repeat product", "Send", "Reorder email, no discount"],
  ] as const;
  return (
    <section className="v3-after">
      <div className="v2-wrap">
        <Rise>
          <div className="v3-after__head">
            <div>
              <p className="v2-eyebrow mono">a changing customer, a changing decision</p>
              <h2 className="v2-section__h">Left alone today. Ready for a nudge tomorrow.</h2>
              <p className="v2-section__lede">Joon does not put people in a permanent bucket. It checks their buying rhythm, recent behaviour and the campaign in front of it, then explains when the decision changes.</p>
            </div>
          </div>
          <div className="v3-journey__flow" aria-label="Illustrative customer decision timeline">
            {decisions.map(([when, evidence, decision, reason], index) => (
              <div className="v3-journey__step" key={when}>
                {index > 0 && <i aria-hidden="true">→</i>}
                <article className={decision === "Left alone" ? "is-silent" : decision === "Send" ? "is-send" : ""}>
                  <span className="mono">{when} · Maya</span>
                  <strong>{decision}</strong>
                  <small>{evidence}</small>
                  <p>{reason}</p>
                </article>
              </div>
            ))}
          </div>
          <div className="v3-left-alone">
            <strong>Every quiet decision has a reason</strong>
            <span>Priya · bought 2h ago <b>left alone · recently purchased</b></span>
            <span>Dev · 3 emails this week <b>left alone · fatigue cap</b></span>
            <span>Nisha · 22:40 local <b>deferred · sends 07:00 her time</b></span>
          </div>
          <p className="v3-illustrative mono">Illustrative state progression. Joon re-evaluates when orders, browsing or time change the customer&rsquo;s state.</p>
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
              "Across comparable campaigns, the random control shows whether the nudge helped.",
      "Measured",
    ],
  ] as const;
  return (
    <section className="v2-section v3-sharper">
      <div className="v2-wrap">
        <Rise className="v3-sharper__copy">
          <p className="v2-eyebrow mono">more campaigns, sharper decisions</p>
          <h2 className="v2-section__h">A small control stays random. Deliberate restraint grows.</h2>
          <p className="v2-section__lede">
            Joon can start with order history: who buys at full price, their usual reorder rhythm
            and what they buy. As fresh campaigns add evidence, more customers can be left alone
            for offers they do not need—and brought back the moment their state changes.
          </p>
          <p className="v3-sharper__rule">
            Suppression changes with the customer. The control remains a small random sample of
            current campaign candidates.
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
        <strong>Email today.</strong>
        <p>Campaigns, journeys, customer state and approval—one channel, made accountable.</p>
      </div>
    </section>
  );
}
