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
  name: string;
  report: string;
  title: string;
  takeaway: string;
  state: readonly (readonly [string, string])[];
  rows: readonly (readonly [string, string, string, string])[];
};

const stories: readonly Story[] = [
  {
    name: "Ankita",
    report: "A campaign report would call her inactive",
    title: "The message was the product.",
    takeaway: "Email, not WhatsApp. A relevant nudge, not another discount.",
    state: [["RFM", "At risk"], ["90d orders", "0"], ["last order", "118d"], ["emails · 7d", "0"], ["discount habit", "low"]],
    rows: [
      ["30d", "held", "nothing", "bought full price"],
      ["90d", "held", "nothing", "did not return"],
      ["104d", "sent", "WhatsApp reminder", "no response"],
      ["111d", "sent", "WhatsApp follow-up", "no response"],
      ["118d", "sent", "email · no discount", "bought full price"],
    ],
  },
  {
    name: "Rohan",
    report: "A campaign report would call every code a conversion",
    title: "Attribution was lying.",
    takeaway: "The codes were discounting him, not converting him.",
    state: [["RFM", "Champion"], ["90d orders", "4"], ["90d value", "₹18,400"], ["full-price", "72%"], ["emails · 7d", "2"]],
    rows: [
      ["71%", "sent", "20% off", "bought with code"],
      ["62%", "held", "nothing", "bought full price"],
      ["50%", "held", "nothing", "bought full price"],
      ["42%", "sent", "new arrivals", "bought full price"],
    ],
  },
  {
    name: "Meera",
    report: "A campaign report would count the revenue",
    title: "A send has a price.",
    takeaway: "Silence protected a high-value customer from fatigue.",
    state: [["RFM", "Loyal"], ["90d orders", "3"], ["90d value", "₹12,800"], ["last order", "31d"], ["emails · 7d", "3"]],
    rows: [
      ["15d", "sent", "member edit", "bought"],
      ["18d", "sent", "weekend offer", "ignored"],
      ["24d", "sent", "new collection", "ignored"],
      ["31d", "held", "nothing", "returned herself"],
    ],
  },
  {
    name: "Kavya",
    report: "A campaign report would claim it moved an order",
    title: "Moved is not made.",
    takeaway: "The discount shifted timing. It did not create demand.",
    state: [["RFM", "Potential loyalist"], ["cadence", "34d"], ["90d orders", "2"], ["90d value", "₹7,600"], ["discount habit", "medium"]],
    rows: [
      ["day 27", "held", "nothing", "bought · −8d"],
      ["day 35", "sent", "10% off", "bought early"],
      ["day 52", "sent", "reminder", "no order · +17d"],
      ["day 61", "held", "nothing", "natural cycle returns"],
    ],
  },
  {
    name: "Maya",
    report: "A campaign report would reward one more send",
    title: "Attention has a limit.",
    takeaway: "Joon protected the next message by refusing this one.",
    state: [["RFM", "Promising"], ["90d orders", "2"], ["90d value", "₹5,900"], ["last click", "2d"], ["emails · 7d", "3 · cap"]],
    rows: [
      ["Mon", "sent", "welcome note", "opened · browsed"],
      ["Wed", "sent", "category edit", "clicked · no order"],
      ["Fri", "sent", "cart reminder", "returned · no order"],
      ["Sat", "excluded", "fatigue cap", "left alone · reason logged"],
      ["Tue", "eligible", "new arrivals", "next decision reopened"],
    ],
  },
] as const;

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
            <p className="v2-eyebrow mono">five customers, five lessons</p>
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
            <span className="mono">
              {story.name} · {story.report}
            </span>
            <h3>{story.title}</h3>
          </div>
          <dl className="v3-story__state" aria-label={`${story.name}'s state at decision time`}>
            {story.state.map(([label, value]) => (
              <div key={label}>
                <dt className="mono">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="v3-story__table">
            <div className="v3-story__labels mono">
              <span>state</span>
              <span>arm</span>
              <span>what Joon did</span>
              <span>what happened</span>
            </div>
            {story.rows.map((row, index) => (
              <div className="v3-story__row" key={`${row[0]}-${index}`}>
                <b>{row[0]}</b>
                <span className={row[1] === "held" ? "is-held" : ""}>{row[1]}</span>
                <span>{row[2]}</span>
                <strong>{row[3]}</strong>
              </div>
            ))}
          </div>
          <footer>
            {story.takeaway}
            <span className="mono">Figures illustrative</span>
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
