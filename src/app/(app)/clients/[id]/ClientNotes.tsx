"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addClientNote, deleteClientNote } from "./notes-actions";

export type NoteView = { id: string; body: string; author: string; when: string; canDelete: boolean };

/** A client's notes, newest first. Anyone who can open the page can add one; its writer or an Admin can delete it. */
export default function ClientNotes({ clientId, notes }: { clientId: string; notes: NoteView[] }) {
  const add = addClientNote.bind(null, clientId);
  const [state, action, pending] = useActionState(add, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <>
      <form ref={ref} action={action} className="cnote-form">
        <label htmlFor="cn-body">Add a note</label>
        <textarea id="cn-body" name="body" rows={3} maxLength={2000} required placeholder="e.g. Their finance team queried the June invoice; waiting for a reply." />
        <div className="row"><button className="btn primary" disabled={pending}>{pending ? "Adding…" : "Add note"}</button></div>
        {state?.error && <p className="err-text" role="alert">{state.error}</p>}
      </form>
      {notes.length ? <ul className="cnotes">{notes.map((n) => <NoteItem key={n.id} note={n} />)}</ul> : <p className="note" style={{ margin: "12px 0 0" }}>No notes yet.</p>}
    </>
  );
}

function NoteItem({ note }: { note: NoteView }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const remove = () => {
    if (!window.confirm("Delete this note? It can't be brought back.")) return;
    setError("");
    start(async () => { const r = await deleteClientNote(note.id); if (!r.ok) setError(r.error ?? "That didn't work. Try again."); });
  };
  return (
    <li>
      <div className="cnote-head"><b>{note.author}</b><span className="note">{note.when}</span></div>
      <p className="cnote-body">{note.body}</p>
      {note.canDelete && <div className="row"><button type="button" className="btn bad sm" disabled={pending} aria-label={`Delete the note from ${note.when}`} onClick={remove}>{pending ? "Deleting…" : "Delete"}</button></div>}
      {error && <p className="err-text" role="alert">{error}</p>}
    </li>
  );
}
