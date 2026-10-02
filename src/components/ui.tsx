export const Pill = ({ tone, children }: { tone: string; children: React.ReactNode }) => <span className={`pill p-${tone}`}>{children}</span>;

export const statusTone = (s: string) => ({ DRAFT: "draft", SUBMITTED: "submitted", APPROVED: "approved", REJECTED: "rejected" })[s] ?? "info";

export const Dot = ({ color }: { color: string }) => <span className="dot" style={{ background: `var(--${color})` }} />;

export const Req = ({ on }: { on: boolean }) => (on ? <span className="req" aria-hidden="true"> *</span> : null);
