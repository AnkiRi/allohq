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
  return (
    <div className="a2-approval" aria-label="Illustrative Joon campaign dry run">
      <div className="a2-surface-head">
        <span>Pre-send safety check</span>
        <span>dry run</span>
      </div>
      <p className="a2-request">
        You asked for: <strong>30% off, top 20 customers</strong>
      </p>
      <dl className="a2-counts">
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

export function HoldoutMarks() {
  return (
    <div
      className="a2-holdout"
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
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <strong>Written to no one. On purpose.</strong>
      </div>
    </div>
  );
}
