/** The AV Design Labs header on reports: the full-colour logo on white with report details on the right and a thin coral line underneath, like company letterhead. */
export function BrandBand({ title, lines, right, className }: { title?: string; lines?: string[]; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`avband${className ? ` ${className}` : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/avdl-logo.png" alt="AV Design Labs" width={93} height={58} />
      {right ?? <div className="avband-r">{title && <b>{title}</b>}{lines?.map((l) => <span key={l}>{l}</span>)}</div>}
    </div>
  );
}

/** The small pie mark with a line of text, for the foot of a report. */
export function BrandFoot({ text, className }: { text: string; className?: string }) {
  return (
    <p className={`avfoot${className ? ` ${className}` : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/avdl-mark.png" alt="" width={7} height={16} />
      {text}
    </p>
  );
}
