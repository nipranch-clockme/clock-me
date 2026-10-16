"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteClient, setClientArchived } from "./archive-actions";

/** Admins archive a client, bring it back, or delete it once it is archived and has no projects left. */
export default function ClientArchive({ id, name, archived, projectCount }: { id: string; name: string; archived: boolean; projectCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.error ?? "That didn't work. Try again.");
    else done?.();
  });
  return (
    <>
      {archived
        ? <>
            <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => setClientArchived(id, false))}>Restore</button>
            <button type="button" className="btn sm bad" disabled={pending || projectCount > 0} title={projectCount > 0 ? "Remove its projects before deleting the client" : undefined}
              onClick={() => { if (window.confirm(`Delete ${name} for good? This can't be undone.`)) run(() => deleteClient(id), () => router.push("/clients")); }}>Delete client</button>
          </>
        : <button type="button" className="btn sm" disabled={pending} onClick={() => { if (window.confirm(`Archive ${name}? It leaves the client lists and project pickers. Its history stays in the reports.`)) run(() => setClientArchived(id, true)); }}>Archive client</button>}
      {error && <p className="err-text" role="alert" style={{ margin: "6px 0 0", width: "100%" }}>{error}</p>}
    </>
  );
}
