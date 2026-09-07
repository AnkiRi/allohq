"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

function useReveal(threshold = 0.4) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

type DecisionReceiptProps = {
  meta: string;
  decision: string;
  outcome: string;
  silent?: boolean;
  tabIndex?: number;
};

export function DecisionReceipt({
  meta,
  decision,
  outcome,
  silent,
  tabIndex,
}: DecisionReceiptProps) {
  return (
    <article className={`a2-decision-receipt ${silent ? "is-silent" : ""}`} tabIndex={tabIndex}>
      <span>{meta}</span>
      <strong>{decision}</strong>
      <p>{outcome}</p>
    </article>
  );
}

const streamItems: DecisionReceiptProps[] = [
  {
    meta: "05:00 · WIN-BACK · 187",
    decision: "3 drafts queued for approval",
    outcome: "nothing sent over your head",
  },
  {
    meta: "09:04 · PRIYA · linen, March",
    decision: "Silent · left alone",
    outcome: "won’t pitch October woollens",
    silent: true,
  },
  {
    meta: "16:30 · REEMA · triphala low",
    decision: "Sent · reorder nudge",
    outcome: "timed to her cycle, not a Tuesday",
  },
  {
    meta: "19:00 · CONTROL · 28 of 187",
    decision: "Held back on purpose",
    outcome: "so the lift is measured, not claimed",
    silent: true,
  },
  {
    meta: "23:58 · KARAN · reads at midnight",
    decision: "Sent · on his clock",
    outcome: "not at 9am",
  },
  {
    meta: "TOP 20 · 30% OFF",
    decision: "2 held out",
    outcome: "bought this week anyway",
    silent: true,
  },
];

export function ReceiptStream() {
  const { ref, visible } = useReveal(0.1);
  return (
    <section
      ref={ref}
      className={`a2-stream ${visible ? "is-active" : ""}`}
      aria-label="Illustrative Joon decision receipts"
    >
      <div className="a2-stream__track" aria-hidden="true">
        {[...streamItems, ...streamItems].map((item, index) => (
          <DecisionReceipt key={`${item.meta}-${index}`} {...item} />
        ))}
      </div>
      <div className="a2-sr-only">
        {streamItems.map((item) => (
          <DecisionReceipt key={item.meta} {...item} />
        ))}
      </div>
      <p>decisions illustrative</p>
    </section>
  );
}

const ledgerRows = [
  ["1", "14 orders · ₹19.6k", "12", "control", "silence", "bought ₹1,400 anyway"],
  ["2", "15 orders · ₹21.0k", "30", "control", "silence", "bought ₹1,100 anyway"],
  ["5", "16 orders · ₹22.1k", "90", "control", "silence", "nothing — she’s gone"],
  ["6", "16 orders · ₹22.1k", "104", "treated", "email · 15% off", "no response"],
  ["7", "16 orders · ₹22.1k", "118", "treated", "email · 15% off", "no response"],
  ["8", "16 orders · ₹22.1k", "131", "treated", "email · no discount", "bought ₹1,350"],
];

export function LedgerScene() {
  const { ref, visible } = useReveal(0.3);
  return (
    <div ref={ref} className={`a2-ledger ${visible ? "is-visible" : ""}`}>
      <span className="a2-ledger__ghost">8</span>
      <div className="a2-ledger__head" aria-hidden="true">
        <span>#</span>
        <span>state at decision</span>
        <span>days</span>
        <span>arm</span>
        <span>what Joon did</span>
        <span>what happened</span>
      </div>
      {ledgerRows.map((row, index) => (
        <article key={row[0]} style={{ "--row-index": index } as CSSProperties} tabIndex={0}>
          <span>{row[0]}</span>
          <span>{row[1]}</span>
          <b>{row[2]}d</b>
          <span className={row[3] === "control" ? "is-ring" : "is-dot"}>{row[3]}</span>
          <span>{row[4]}</span>
          <strong>{row[5]}</strong>
        </article>
      ))}
      <small>rows 3–4 elided · figures illustrative</small>
    </div>
  );
}

const rohanReceipts = [
  ["21 orders · full-price 71% · gap 22d", "Sent · 20% off", "bought ₹1,800 · code used", false],
  [
    "23 orders · full-price 62% · gap 25d",
    "Silent · control",
    "bought ₹1,700 · full price · 8 days later",
    true,
  ],
  [
    "25 orders · full-price 50% · gap 29d",
    "Silent · control",
    "bought ₹1,900 · full price · again",
    true,
  ],
  [
    "26 orders · full-price 42% · gap 31d",
    "Sent · new arrivals · no code",
    "bought ₹1,850 · full price",
    false,
  ],
] as const;

export function BlastComparison() {
  const { ref, visible } = useReveal(0.3);
  return (
    <div ref={ref} className={`a2-blast ${visible ? "is-visible" : ""}`}>
      <article className="a2-blast__rows">
        <span>what a blast tool sees</span>
        <h3>4,820 rows.</h3>
        <div aria-hidden="true">
          {Array.from({ length: 96 }, (_, index) => (
            <i key={index} />
          ))}
        </div>
        <p>Every row gets the same code at 9am. Rohan looks like the best customer.</p>
      </article>
      <article className="a2-blast__person">
        <span>what Joon sees</span>
        <h3>Rohan, trained to wait.</h3>
        <div>
          {rohanReceipts.map(([meta, decision, outcome, silent], index) => (
            <div key={meta} style={{ "--row-index": index } as CSSProperties}>
              <DecisionReceipt
                meta={meta}
                decision={decision}
                outcome={outcome}
                silent={silent}
                tabIndex={0}
              />
            </div>
          ))}
        </div>
        <p>The codes weren’t converting him. They were discounting him—and teaching him to wait.</p>
      </article>
    </div>
  );
}

function FlowNode({
  kind,
  title,
  detail,
  className = "",
}: {
  kind: string;
  title: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={`a2-spec-node ${className}`}>
      <span>{kind}</span>
      <strong>{title}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function JourneyScene() {
  const { ref, visible } = useReveal(0.35);
  return (
    <div ref={ref} className={`a2-journey-spec ${visible ? "is-visible" : ""}`}>
      <div className="a2-journey-spec__flow">
        <FlowNode kind="Trigger" title="Checkout Started" />
        <i>→</i>
        <FlowNode kind="Wait" title="3 hours" />
        <i>→</i>
        <FlowNode kind="Condition" title="Has made a purchase?" />
        <i>→</i>
        <FlowNode
          kind="Silence"
          title="Leave alone"
          detail="bought already · logged"
          className="is-silent"
        />
        <i>→</i>
        <FlowNode kind="Holdout" title="15% held back" detail="per entrant · deterministic" />
        <i>→</i>
        <FlowNode
          kind="Send Email"
          title="In your voice"
          detail="from BrandProfile"
          className="is-send"
        />
      </div>
      <div className="a2-left-alone">
        <strong>Left alone, and why</strong>
        <span>
          Priya · bought 2h ago <b>already purchased</b>
        </span>
        <span>
          Dev · 3 emails this week <b>fatigue cap</b>
        </span>
        <span>
          Nisha · 22:40 local <b>quiet hours</b>
        </span>
      </div>
    </div>
  );
}

export function Section({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
