"use client";
import { startTransition, useActionState, useEffect, useState } from "react";
import { setupAdmin, type SetupState } from "./actions";

export default function SetupForm({ needsProof }: { needsProof: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(setupAdmin, null);
  const [tz, setTz] = useState("UTC");
  useEffect(() => { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); }, []);
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }}>
      {needsProof && (
        <div>
          <label htmlFor="su-proof">Database connection string</label>
          <input id="su-proof" name="proof" type="password" autoComplete="off" required placeholder="postgresql://…" />
          <p className="note" style={{ margin: "4px 0 0" }}>Paste the DATABASE_URL you added in Vercel (copy it again from Neon if needed). It proves you&apos;re the person who set up this site. It isn&apos;t stored.</p>
        </div>
      )}
      <input type="hidden" name="timeZone" value={tz} />
      <div><label htmlFor="su-name">Your name</label><input id="su-name" name="name" autoComplete="name" required /></div>
      <div><label htmlFor="su-email">Work email</label><input id="su-email" name="email" type="email" autoComplete="email" required /></div>
      <div><label htmlFor="su-office">Your office</label><input id="su-office" name="office" placeholder="e.g. New York" required /></div>
      <div><label htmlFor="su-pw">Password</label><input id="su-pw" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
      <div><label htmlFor="su-pw2">Password again</label><input id="su-pw2" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></div>
      {state?.error && <p className="err-text" role="alert">{state.error}</p>}
      <button className="btn primary" disabled={pending}>{pending ? "Setting up…" : "Create admin account"}</button>
    </form>
  );
}
