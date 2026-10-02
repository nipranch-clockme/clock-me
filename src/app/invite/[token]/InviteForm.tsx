"use client";
import { useActionState } from "react";
import { acceptInvite } from "../../login/actions";

export default function InviteForm({ token }: { token: string }) {
  const [error, action, pending] = useActionState(acceptInvite, null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="token" value={token} />
      <div><label htmlFor="password">New password</label><input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" /></div>
      <div><label htmlFor="confirm">Repeat password</label><input id="confirm" name="confirm" type="password" minLength={8} required autoComplete="new-password" /></div>
      {error && <p className="err-text" role="alert">{error}</p>}
      <button className="btn primary big" disabled={pending}>Set password and sign in</button>
    </form>
  );
}
