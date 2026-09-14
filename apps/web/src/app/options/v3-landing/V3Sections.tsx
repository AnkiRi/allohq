"use client";

import { useCallback, useRef, useState } from "react";

const decisions = [
  ["05:00", "Win-back", "Sent for approval", "3 drafts ready. Nothing sent."],
  ["09:04", "Priya", "Silent", "Bought linen yesterday. Left alone."],
  ["16:30", "Reema", "Sent", "Reorder nudge timed to her cycle."],
  ["19:00", "28 of 187", "Silent", "Held back to measure the campaign."],
  ["23:58", "Karan", "Sent", "Delivered when he usually reads."],
  ["00:12", "Maya", "Silent", "Already at the fatigue limit."],
] as const;

export function DecisionMarquee() {
  return (
    <section className="v3-marquee" aria-label="Illustrative Joon decisions">
      <div className="v3-marquee__fade" aria-hidden="true" />
      <div className="v3-marquee__track" aria-hidden="true">
        {[...decisions, ...decisions].map(([time, who, decision, outcome], index) => (
          <article className={decision === "Silent" ? "is-silent" : ""} key={`${time}-${index}`}>
            <span className="mono">
              {time} · {who}
            </span>
            <strong>
              <i />
              {decision}
            </strong>
            <p>{outcome}</p>
          </article>
        ))}
      </div>
      <ul className="v3-sr-only">
        {decisions.map(([time, who, decision, outcome]) => (
          <li key={`${time}-${who}`}>
            {time}, {who}: {decision}. {outcome}
          </li>
        ))}
      </ul>
      <p className="v3-marquee__label mono">Decisions illustrative</p>
    </section>
  );
}

type Story = {
  id: string;
  name: string;
  hook: string;
  rows: readonly { when: string; saw: string; did: string; got: string }[];
  proof: string;
};

const stories: readonly Story[] = [
  {
    id: "ankita",
    name: "Ankita",
    hook: "The revenue your email tool was taking credit for",
    rows: [
      { when: "Day 0", saw: "Champion · 34-day cycle · due to buy", did: "**Left her out of the discount by decision**", got: "Bought day 6 — full price, uncontacted" },
      { when: "Day 28", saw: "Same pattern, second time", did: "Kept her off this discount", got: "Bought again — **₹4,900 without a nudge**" },
      { when: "Day 129", saw: "**Gap 68 days — 2× her own cycle**", did: "Two win-backs, no discount", got: "Both ignored" },
      { when: "Day 145", saw: "**11 of 14 opens land 13:40–15:10**", did: "Sent 14:20 · restock · no code", got: "Opened in 9 min · bought ₹2,900" },
    ],
    proof: "Wrong hour, not wrong price.",
  },
  {
    id: "rohan",
    name: "Rohan",
    hook: "The discount habit your own emails taught him",
    rows: [
      { when: "Today", saw: "**Full price 71% → 42%** · gap 28d → 47d", did: "Traced it: 19 of 19 emails carried a code", got: "He had learned to wait" },
      { when: "Cycle 1", saw: "Every blast deepens the habit", did: "**Removed him from all coded sends**", got: "Silence, by design" },
      { when: "Day 39", saw: "New arrival in his repeat category", did: "Full-price email, no code", got: "**Bought ₹2,150 at full price**" },
      { when: "+3 orders", saw: "Gap narrowed 47d → 34d", did: "Kept him off coded sends", got: "**Full price back to 55% · +₹430/order**" },
    ],
    proof: "The discount was the disease.",
  },
  {
    id: "meera",
    name: "Meera",
    hook: "Seven months of silence, on purpose",
    rows: [
      { when: "Month 7", saw: "**Silent 210 days** — 'lost' to any rule", did: "Read her history before acting", got: "Found an 11-month cycle, ±9 days" },
      { when: "Months 1–7", saw: "Basket: 6 units, 3 ship-to names", did: "**Suppressed 14 of 16 blasts**", got: "14 unsubscribe risks declined" },
      { when: "−12 days", saw: "**Her window opens in 12 days**", did: "One email · gift sets · no code", got: "Opened within the hour" },
      { when: "Day 0", saw: "Diwali window", did: "Left her alone", got: "**₹9,100 — her largest order yet**" },
    ],
    proof: "Restraint you can measure.",
  },
  {
    id: "kavya",
    name: "Kavya",
    hook: "A 90-day rule would have missed it by 38 days",
    rows: [
      { when: "Cycles 1–6", saw: "**35-day cycle, ±4 days** · one pulled 5d early", did: "Learned her rhythm", got: "No sends needed" },
      { when: "Day 52", saw: "**17 days late — 1.49× her median**", did: "Reorder reminder, no discount", got: "No response" },
      { when: "Day 59", saw: "**Viewed the same product page**", did: "Free shipping (₹99), not 20% off", got: "Bought ₹1,890" },
      { when: "Result", saw: "Caught at day 52, not day 90", did: "Spent ₹99 instead of ₹378", got: "**38 days earlier · ₹279 more margin**" },
    ],
    proof: "Her cycle, not your calendar.",
  },
] as const;

function Emphasis({ children }: { children: string }) {
  return <>{children.split("**").map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part)}</>;
}

export function CustomerStories() {
  const [active, setActive] = useState(0);
  const touchStart = useRef<number | null>(null);
  const move = useCallback(
    (delta: number) => setActive((value) => (value + delta + stories.length) % stories.length),
    []
  );
  const story = stories[active]!;
  return (
    <section
      id="stories"
      className="v2-section v3-stories"
      aria-labelledby="v3-stories-title"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
      }}
    >
      <div className="v2-wrap">
        <header className="v3-stories__head">
          <div>
            <p className="v2-eyebrow mono">four customers, four decisions</p>
            <h2 className="v2-section__h" id="v3-stories-title">
              What the receipt remembers.
            </h2>
          </div>
          <div className="v3-stories__arrows">
            <button onClick={() => move(-1)} aria-label="Previous customer">
              ←
            </button>
            <button onClick={() => move(1)} aria-label="Next customer">
              →
            </button>
          </div>
        </header>
        <article
          className="v3-story"
          onTouchStart={(event) => {
            touchStart.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            if (touchStart.current == null) return;
            const end = event.changedTouches[0]?.clientX ?? touchStart.current;
            if (Math.abs(end - touchStart.current) > 45) move(end < touchStart.current ? 1 : -1);
            touchStart.current = null;
          }}
        >
          <div className="v3-story__intro">
            <span className="mono">{story.name}</span>
            <h3>{story.hook}</h3>
          </div>
          <div className="v3-story__table">
            <div className="v3-story__labels mono">
              <span>when</span>
              <span>what Joon saw</span>
              <span>what Joon did</span>
              <span>what happened</span>
            </div>
            {story.rows.map((row, index) => (
              <div className="v3-story__row" key={`${row.when}-${index}`}>
                <b>{row.when}</b>
                <span data-label="Joon saw"><Emphasis>{row.saw}</Emphasis></span>
                <span data-label="Joon did"><Emphasis>{row.did}</Emphasis></span>
                <span data-label="What happened"><Emphasis>{row.got}</Emphasis></span>
              </div>
            ))}
          </div>
          <footer>
            <div><b>{story.proof}</b><p>Every field is computed from order history alone. The decision is the product.</p></div>
            <span className="mono">Illustrative composites. Measured merchant results appear here once control data exists.</span>
          </footer>
        </article>
        <div className="v3-stories__dots" role="group" aria-label="Choose customer story">
          {stories.map((item, index) => (
            <button
              key={item.name}
              className={index === active ? "is-active" : ""}
              onClick={() => setActive(index)}
              aria-label={`Show ${item.name}`}
              aria-pressed={index === active}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
