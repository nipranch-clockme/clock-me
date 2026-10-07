/** Tick boxes for the tags on an entry: any number, or none. Sent as several values named tagIds.
 *  In a read-only view it lists just the entry's own tags. */
export default function TagPicker({ id, tags, selected, required, invalid, readOnly }: {
  id: string; tags: { id: string; name: string }[]; selected: string[]; required: boolean; invalid?: boolean; readOnly?: boolean;
}) {
  if (readOnly) {
    const own = tags.filter((t) => selected.includes(t.id));
    return (
      <fieldset className="tagpick">
        <legend>Tags</legend>
        {own.length ? <div className="tagpick-list">{own.map((t) => <span key={t.id} className="tagpick-i on">{t.name}</span>)}</div> : <p className="note" style={{ margin: 0 }}>No tags</p>}
      </fieldset>
    );
  }
  return (
    <fieldset className={`tagpick${invalid ? " err" : ""}`} aria-describedby={tags.length ? id + "-h" : undefined}>
      <legend>Tags{required && <span className="req"> *</span>}</legend>
      {tags.length ? (
        <>
          <div className="tagpick-list">
            {tags.map((t) => (
              <label key={t.id} className="tagpick-i"><input type="checkbox" name="tagIds" value={t.id} defaultChecked={selected.includes(t.id)} />{t.name}</label>
            ))}
          </div>
          <p className="note" id={id + "-h"} style={{ margin: "4px 0 0" }}>{required ? "Tick one or more." : "Tick any that apply."}</p>
        </>
      ) : <p className="note" style={{ margin: 0 }}>There are no tags yet. An admin adds them in Settings.</p>}
    </fieldset>
  );
}
