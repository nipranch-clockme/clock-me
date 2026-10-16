"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import Logo from "@/components/Logo";

/** Shown when a page outside the app's own layout fails, in place of Next's bare error text. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  // Most failures happen on the server, so fetch the page again as well as redrawing it.
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  return (
    <div className="login">
      <div className="brand" style={{ marginBottom: 20 }}><Logo id="logo-brand" className="brandlogo" /><h1>The Time Sink</h1></div>
      <section className="panel">
        <h2>Something went wrong</h2>
        <p className="sub">This page didn&apos;t load properly. Try again, or go to your timesheet. If it keeps happening, tell your Admin.</p>
        <div className="row"><button type="button" className="btn primary" onClick={retry}>Try again</button><Link className="btn" href="/timesheet">Go to your timesheet</Link></div>
      </section>
    </div>
  );
}
