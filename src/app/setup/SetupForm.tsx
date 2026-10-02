"use client";
import { startTransition, useActionState } from "react";
import { setupAdmin, type SetupState } from "./actions";

export default function SetupForm() {
  const [state, action, pending] = useActionState<SetupState, FormData>(setupAdmin, null);
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }}>
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
