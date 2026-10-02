"use client";
import { useActionState } from "react";
import { requestReset } from "../actions";

export default function ForgotForm() {
  const [msg, action, pending] = useActionState(requestReset, null);
  if (msg) return <p role="status">{msg}</p>;
  return (
    <form action={action} className="stack">
      <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
      <button className="btn primary" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}
