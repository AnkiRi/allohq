"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type ReceiptProps = {
  time: string;
  name: string;
  decision: string;
  reason: string;
  silent?: boolean;
};

export function Receipt({ time, name, decision, reason, silent }: ReceiptProps) {
  return (
    <article className={`a2-receipt ${silent ? "is-silent" : ""}`}>
      <div className="a2-receipt__meta">
        <span>{time}</span>
        <span>{name}</span>
      </div>
      <strong>{decision}</strong>
      <p>{reason}</p>
    </article>
  );
}

export function ApprovalSurface() {
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setResolved(true);
      return;
    }
    const timer = window.setTimeout(() => setResolved(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={`a2-approval ${resolved ? "is-resolved" : "is-working"}`}
      aria-label="Illustrative Joon campaign dry run"
    >
      <div className="a2-surface-head">
        <span>Pre-send safety check</span>
        <span>dry run</span>
      </div>
      <p className="a2-request">
        You asked for: <strong>30% off, top 20 customers</strong>
      </p>
      <div className="a2-working-state" aria-hidden={resolved}>
        <i />
        <span>Considering 20 customer records</span>
      </div>
      <div className="a2-decision-marks" aria-hidden="true">
        {Array.from({ length: 20 }, (_, index) => (
          <i
            key={index}
            className={index > 15 ? (index > 17 ? "is-skip" : "is-control") : ""}
            style={{ "--mark-index": Math.max(0, index - 16) } as CSSProperties}
          />
        ))}
      </div>
      <dl className="a2-counts" aria-hidden={!resolved}>
        <div>
          <dt>Who will receive this</dt>
          <dd>16</dd>
        </div>
        <div className="is-silent">
          <dt>Held back to measure</dt>
          <dd>2</dd>
        </div>
        <div className="is-skip">
          <dt>Skipped, bought this week</dt>
          <dd>2</dd>
        </div>
      </dl>
      <div className="a2-reason">
        <span>How Joon decided</span>
        <p>
          Two bought this week. A discount would not have moved them. We left them out and wrote to
          the other sixteen.
        </p>
      </div>
      <div className="a2-actions">
        <b>Approve 16 sends</b>
        <span>Adjust</span>
      </div>
      <small>Example store data · no provider call</small>
    </div>
  );
}

export function DecisionMarks() {
  const root = useRef<HTMLDivElement>(null);
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    if (!root.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDecided(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setDecided(true);
          observer.disconnect();
        }
      },
      { threshold: 0.55 }
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={root}
      className={`a2-people a2-decision-people ${decided ? "is-decided" : ""}`}
      aria-label="16 selected, two held back for measurement and two skipped"
    >
      {Array.from({ length: 20 }, (_, index) => (
        <i
          key={index}
          className={index > 15 ? (index > 17 ? "is-skip" : "is-control") : ""}
          style={{ "--mark-index": Math.max(0, index - 16) } as CSSProperties}
        />
      ))}
    </div>
  );
}

export function HoldoutMarks() {
  const root = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!root.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={root}
      className={`a2-holdout ${revealed ? "is-revealed" : ""}`}
      aria-label="159 written to and 28 held back in an illustrative cohort"
    >
      <div className="a2-holdout__group">
        <span>written to</span>
        <div className="a2-mark-grid">
          {Array.from({ length: 42 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <strong>159 in this example</strong>
      </div>
      <div className="a2-holdout__group is-control">
        <span>left out to measure</span>
        <div className="a2-mark-grid">
          {Array.from({ length: 28 }, (_, i) => (
            <i key={i} style={{ "--mark-index": i } as CSSProperties} />
          ))}
        </div>
        <strong>Written to no one. On purpose.</strong>
      </div>
    </div>
  );
}
