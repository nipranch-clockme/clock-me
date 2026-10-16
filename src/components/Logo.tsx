/**
 * The Time Sink logo: a faceted grey and coral clock face with white hands. Drawn as SVG so it stays sharp at any size,
 * and the hands are separate so the loading animation can turn them. `id` keeps the clip and gradient names unique when
 * the logo appears more than once on a page (the sidebar and the phone top bar are both in the page at once).
 * A soft coral glow round the edge (the "neon" look) needs room, so the drawing area is larger than the circle.
 * src/app/icon.svg (the browser tab icon) is the same drawing; change both together.
 */
export default function Logo({ id, spin, className, label }: { id: string; spin?: boolean; className?: string; label?: string }) {
  const clip = `${id}-clip`, coral = `${id}-coral`, glow = `${id}-glow`, rim = `${id}-rim`;
  return (
    <svg className={`logo${spin ? " spin" : ""}${className ? ` ${className}` : ""}`} viewBox="122 19 556 556" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <clipPath id={clip}><circle cx="400" cy="297" r="232" /></clipPath>
        <linearGradient id={coral} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#e0603f" /><stop offset="1" stopColor="#f5755a" /></linearGradient>
        <filter id={glow} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14" /></filter>
        <filter id={rim} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <circle cx="400" cy="297" r="240" fill="#ff8666" fillOpacity=".85" filter={`url(#${glow})`} />
      <circle cx="400" cy="297" r="232" fill="#141414" />
      <g clipPath={`url(#${clip})`}>
        <path d="M168 65H420L250 190 168 262Z" fill="#0a0a0a" />
        <path d="M168 175 300 150 205 298 168 302Z" fill="#6b6b6b" />
        <path d="M205 298 470 60 538 98 512 422Z" fill="#808080" fillOpacity=".6" />
        <path d="M290 242 472 66 536 96Z" fill="#b3b3b3" fillOpacity=".35" />
        <path d="M538 98 640 190 640 420 512 422Z" fill="#0d0d0d" />
        <path d="M540 108 610 150 566 244Z" fill="#000000" />
        <path d="M168 302 380 345 512 422 168 400Z" fill="#808080" fillOpacity=".6" />
        <path d="M168 340 365 362 640 405V540H168Z" fill="#050505" />
        <path d="M200 458Q420 418 640 392V540H160Z" fill="#ff8666" />
        <path d="M200 458Q270 446 340 438L336 540H160Z" fill={`url(#${coral})`} />
        <path d="M420 430 640 392V540H470Z" fill="#ff9478" />
        <path d="M365 362 476 540H330Z" fill="#ff8666" fillOpacity=".6" />
      </g>
      <circle cx="400" cy="297" r="230" fill="none" stroke="#ff8666" strokeOpacity=".6" strokeWidth="5" filter={`url(#${rim})`} />
      <g transform="translate(400 297)" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="38">
        <g className="hh"><path d="M0 0-78-78" /></g>
        <g className="hm"><path d="M0 0 138-115" /></g>
        <circle r="27" fill="#808080" strokeWidth="26" />
      </g>
    </svg>
  );
}

/** A centred spinning logo with a hidden "Loading" label, shown while a page is on its way. */
export function Loading({ id = "loading" }: { id?: string }) {
  return (
    <div className="pageload" role="status" aria-live="polite">
      <Logo id={id} spin />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
