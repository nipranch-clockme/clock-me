export const Pill = ({ tone, children }: { tone: string; children: React.ReactNode }) => <span className={`pill p-${tone}`}>{children}</span>;

export const statusTone = (s: string) => ({ DRAFT: "draft", SUBMITTED: "submitted", APPROVED: "approved", REJECTED: "rejected" })[s] ?? "info";

export const Dot = ({ color }: { color: string }) => <span className="dot" style={{ background: `var(--${color})` }} />;

export const Req = ({ on }: { on: boolean }) => (on ? <span className="req" aria-hidden="true"> *</span> : null);

/** Page header: big title, the page's main actions on the right, an optional muted line under the title. */
export const PageHead = ({ title, actions, sub, beside }: { title: React.ReactNode; actions?: React.ReactNode; sub?: React.ReactNode; beside?: React.ReactNode }) => (
  <div className="phd">
    <div className="phd-t">
      {beside ? <div className="phd-tt"><h1 tabIndex={-1}>{title}</h1>{beside}</div> : <h1 tabIndex={-1}>{title}</h1>}
      {sub ? <p className="sub">{sub}</p> : null}
    </div>
    {actions ? <div className="phd-a">{actions}</div> : null}
  </div>
);
