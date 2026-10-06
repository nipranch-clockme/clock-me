const initials = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean).map((x) => [...x][0]);
  return ((w[0] ?? "?") + (w.length > 1 ? w[w.length - 1] : "")).toUpperCase();
};

/** A person's profile picture, or a circle with their initials when they haven't added one. */
export default function Avatar({ person, size = 40, alt = "" }: { person: { id: string; name: string; photoAt: Date | null }; size?: number; alt?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  return person.photoAt
    // The address changes with each new picture, so browsers can keep a copy without showing an old one.
    ? <img className="avatar" src={`/profile/${person.id}/photo?v=${person.photoAt.getTime()}`} alt={alt} width={size} height={size} style={style} />
    : <span className="avatar" role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} style={style}>{initials(person.name)}</span>;
}
