"use client";

import {
  motion,
  useReducedMotion,
  useInView,
} from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* THE MORNING BRIEF — reused from frontend-brief/ (Salutation +       */
/* BriefLine + the approvable .mb-item structure), adapted into v2 and */
/* re-themed via the v2 colour tokens (its own .v2-mb__* classes).     */
/*                                                                     */
/* "Good morning, Ujjawal —" types itself once, then each approvable   */
/* line settles in sequence, as if Joon is composing the note while    */
/* you watch. CONTENT is always rendered; motion only enhances an      */
/* already-readable default — JS-off / reduced-motion ships the whole  */
/* brief readable and every Approve / Hold control usable.             */
/* ------------------------------------------------------------------ */

const SETTLE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function Salutation({ text }: { text: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLHeadingElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px" });
  const [shown, setShown] = useState(reduce ? text.length : 0);

  useEffect(() => {
    if (reduce) {
      setShown(text.length);
      return;
    }
    if (!inView) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, [inView, reduce, text]);

  const done = shown >= text.length;
  return (
    <h3 ref={ref} className="v2-mb__salute" aria-label={text}>
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      {!done && !reduce && <span className="v2-mb__caret" aria-hidden="true" />}
    </h3>
  );
}

function BriefLine({
  index = 0,
  children,
}: {
  index?: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { once: true, margin: "-8% 0px" });
  return (
    <motion.li
      ref={ref}
      className="v2-mb__item"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={reduce ? undefined : inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.55, ease: SETTLE, delay: 0.16 * index }}
    >
      {children}
    </motion.li>
  );
}

export function MorningBrief() {
  return (
    <article className="v2-mb" aria-label="Your morning brief from Joon">
      <div className="v2-mb__head">
        <span className="v2-mb__from mono">from Joon · overnight</span>
        <span className="v2-mb__date mono">Mon, 23 Jun · 5:54</span>
      </div>

      <div className="v2-mb__body">
        <Salutation text="Good morning, Ujjawal." />
        <p className="v2-mb__opening">
          Quiet night. I scanned all <span className="v2-mb__fig">4,820</span> of
          your customers. Here&rsquo;s what I lined up. Nothing&rsquo;s
          sent until you say so.
        </p>

        <ul className="v2-mb__items">
          <BriefLine index={0}>
            <p className="v2-mb__text">
              <span className="v2-mb__fig">187</span> lapsed buyers drafted for
              win-back · expected recovery{" "}
              <span className="v2-mb__fig">₹1.2L</span>.
              <span className="v2-mb__sub">
                Last spring&rsquo;s cohort · an estimate until the control proves
                it.
              </span>
            </p>
            <span className="v2-mb__actions">
              <button className="v2-mb__approve" type="button">
                Approve
              </button>
              <button className="v2-mb__hold" type="button">
                Hold
              </button>
            </span>
          </BriefLine>

          <BriefLine index={1}>
            <p className="v2-mb__text">
              Reema&rsquo;s reorder nudge, timed to her cycle, not a
              Tuesday blast.
              <span className="v2-mb__sub">
                Her Triphala runs low this week. Queued for your sign-off.
              </span>
            </p>
            <span className="v2-mb__actions">
              <button className="v2-mb__approve" type="button">
                Approve
              </button>
              <button className="v2-mb__hold" type="button">
                Hold
              </button>
            </span>
          </BriefLine>

          <BriefLine index={2}>
            <span className="v2-mb__item-inner is-control">
              <p className="v2-mb__text">
                The 9am blast, left alone. I held back{" "}
                <span className="v2-mb__fig">22</span> as a control, so the lift
                is proven, not claimed.
                <span className="v2-mb__sub">
                  Holdouts are one-way. You can&rsquo;t measure this after the
                  fact.
                </span>
              </p>
              <span
                className="v2-mb__control-tag mono"
                aria-label="control group held out"
              >
                control · held
              </span>
            </span>
          </BriefLine>
        </ul>

        <p className="v2-mb__sign">
          That&rsquo;s the whole morning. Approve the lot, or tap into any line.
          <span className="v2-mb__sig">· Joon</span>
        </p>
      </div>

      <div className="v2-mb__foot mono">
        drafts before sunrise · approvals over coffee
      </div>
    </article>
  );
}
