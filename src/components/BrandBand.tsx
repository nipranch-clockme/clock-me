/** The AV Design Labs header on reports: a charcoal band with the white logo and a coral stripe underneath. */
export function BrandBand({ title, lines, right, className }: { title?: string; lines?: string[]; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`avband${className ? ` ${className}` : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/avdl-logo-white.png" alt="AV Design Labs" width={93} height={58} />
      {right ?? <div className="avband-r">{title && <b>{title}</b>}{lines?.map((l) => <span key={l}>{l}</span>)}</div>}
    </div>
  );
}

/** The small pie mark with a line of text, for the foot of a report. */
export function BrandFoot({ text, className }: { text: string; className?: string }) {
  return (
    <p className={`avfoot${className ? ` ${className}` : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bm-l" src="/brand/avdl-mark.png" alt="" width={7} height={16} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bm-d" src="/brand/avdl-mark-white.png" alt="" width={7} height={16} />
      {text}
    </p>
  );
}
