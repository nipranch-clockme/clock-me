const initials = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean).map((x) => [...x][0]);
  return ((w[0] ?? "?") + (w.length > 1 ? w[w.length - 1] : "")).toUpperCase();
};

/** A person's profile picture, or a circle with their initials when they haven't added one. */
const tint = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 5) + 1; };

export default function Avatar({ person, size = 40, alt = "" }: { person: { id: string; name: string; photoAt: Date | null }; size?: number; alt?: string }) {
  const style = { "--av": `${size}px` } as React.CSSProperties;
  return person.photoAt
    // The address changes with each new picture, so browsers can keep a copy without showing an old one.
    ? <span className="av" style={style} aria-hidden={alt ? undefined : true}><img src={`/profile/${person.id}/photo?v=${person.photoAt.getTime()}`} alt={alt} /></span>
    : <span className={`av t${tint(person.id)}`} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} style={style}>{initials(person.name)}</span>;
}
