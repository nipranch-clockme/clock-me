"use client";
import { useActionState } from "react";
import { login } from "./actions";

export default function LoginForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="stack">
      {next && <input type="hidden" name="next" value={next} />}
      <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required key={state?.email} defaultValue={state?.email ?? ""} /></div>
      <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      {state?.error && <p className="err-text" role="alert">{state.error}</p>}
      <button className="btn primary big" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
