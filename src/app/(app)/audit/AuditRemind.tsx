"use client";
import { useActionState } from "react";
import { remindDay, type RemindResult } from "./actions";

export function AuditRemind({ userId, date }: { userId: string; date: string }) {
  const [state, action, pending] = useActionState<RemindResult, FormData>(remindDay, null);
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} /><input type="hidden" name="date" value={date} />
      {state ? <span className="note" role="status">{state.message}</span> : <button className="btn sm" disabled={pending}>Remind</button>}
    </form>
  );
}
