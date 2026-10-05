"use client";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removePhoto, saveProfileDetails, uploadPhoto, type ProfileResult } from "./actions";

type Details = { id: string; name: string; employeeId: string; joiningDate: string; weeklyTarget: number };

/** "Edit details" button and its dialog: employee ID, joining date and expected hours per week. */
export function DetailsForm({ person, today }: { person: Details; today: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>Edit details</button>
      <dialog ref={ref} onClose={() => setOpen(false)} aria-labelledby="pd-title">
        {open && <DetailsDialog person={person} today={today} onDone={() => ref.current?.close()} />}
      </dialog>
    </>
  );
}

function DetailsDialog({ person, today, onDone }: { person: Details; today: string; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ProfileResult, FormData>(saveProfileDetails, null);
  useEffect(() => { if (state?.ok) { onDone(); router.refresh(); } }, [state, onDone, router]);
  return (
    <div className="panel">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 id="pd-title">Edit {person.name}</h2>
        <button type="button" className="btn sm" onClick={onDone}>Close</button>
      </div>
      <form onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); startTransition(() => action(fd)); }}>
        <input type="hidden" name="id" value={person.id} />
        <div className="row">
          <div><label htmlFor="pd-emp">Employee ID</label><input id="pd-emp" name="employeeId" maxLength={32} defaultValue={person.employeeId} placeholder="e.g. CM-0042" autoFocus /></div>
          <div><label htmlFor="pd-join">Joining date</label><input id="pd-join" name="joiningDate" type="date" min="1950-01-01" max={today} defaultValue={person.joiningDate} /></div>
          <div><label htmlFor="pd-target">Expected hours per week</label><input id="pd-target" name="weeklyTarget" type="number" min="0" max="80" step="0.5" defaultValue={person.weeklyTarget} /></div>
        </div>
        <p className="note">The joining date shows years of experience on the profile. It doesn&apos;t change utilisation. Set expected hours to 0 to leave someone out of utilisation and the dashboard.</p>
        {state?.error && <p className="err-text" role="alert">{state.error}</p>}
        <div className="row" style={{ marginTop: 14 }}><button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div>
      </form>
    </div>
  );
}

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/** Crops the middle square of a picture and shrinks it to a 256x256 JPEG. */
async function squareJpeg(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff"; // see-through PNGs get a white background instead of black
  ctx.fillRect(0, 0, 256, 256);
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
  img.close();
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("no picture"))), "image/jpeg", 0.85));
}

/** Upload, change or remove a profile picture. `children` (e.g. Edit details) sit in the same row of buttons. */
export function PhotoForm({ id, hasPhoto, children }: { id: string; hasPhoto: boolean; children?: React.ReactNode }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (action: typeof uploadPhoto, photo?: Blob) => {
    const fd = new FormData();
    fd.set("id", id);
    if (photo) fd.set("photo", photo, "photo.jpg");
    start(async () => {
      const r = await action(null, fd);
      if (r?.ok) router.refresh();
      else setError(r?.error ?? "Something went wrong. Try again.");
    });
  };
  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = ""; // picking the same file again still counts as a change
    if (!file) return;
    setError(null);
    if (!TYPES.includes(file.type)) return setError("Choose a JPEG, PNG or WebP picture.");
    if (file.size > MAX_BYTES) return setError("That picture is over 5 MB. Choose a smaller one.");
    let photo: Blob;
    try { photo = await squareJpeg(file); } catch { return setError("We couldn't read that picture. Try a different one."); }
    send(uploadPhoto, photo);
  };
  return (
    <div className="photoform">
      {children}
      <input ref={input} id={`photo-${id}`} type="file" accept={TYPES.join(",")} className="sr-only" tabIndex={-1} aria-label="Profile picture" onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" className="btn sm" disabled={pending} onClick={() => input.current?.click()}>{pending ? "Saving…" : hasPhoto ? "Change photo" : "Upload photo"}</button>
      {hasPhoto && <button type="button" className="btn sm" disabled={pending} onClick={() => { setError(null); send(removePhoto); }}>Remove photo</button>}
      {error && <p className="err-text" role="alert">{error}</p>}
      {!error && <p className="note" style={{ margin: 0 }}>Photo: JPEG, PNG or WebP up to 5 MB, cropped to a square.</p>}
    </div>
  );
}
