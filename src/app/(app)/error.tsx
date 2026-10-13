"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { PageHead } from "@/components/ui";

/** Shown in place of a page that failed, keeping the app's navigation so the person can carry on elsewhere. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  // Most failures happen on the server, so fetch the page again as well as redrawing it.
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  return (
    <>
      <PageHead title="Something went wrong" />
      <section className="panel">
        <p className="sub">This page didn&apos;t load properly. Try again, or go to your timesheet. If it keeps happening, tell your Admin.</p>
        <div className="row"><button type="button" className="btn primary" onClick={retry}>Try again</button><Link className="btn" href="/timesheet">Go to your timesheet</Link></div>
      </section>
    </>
  );
}
