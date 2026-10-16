"use client";
import "./globals.css";
import Logo from "@/components/Logo";

/** Shown when even the outer page frame fails. It replaces the root layout, so it brings its own html and body. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · The Time Sink</title>
        <div className="login">
          <div className="brand" style={{ marginBottom: 20 }}><Logo id="logo-brand" className="brandlogo" /><h1>The Time Sink</h1></div>
          <section className="panel">
            <h2>Something went wrong</h2>
            <p className="sub">The Time Sink didn&apos;t load properly. Try again, or go to your timesheet. If it keeps happening, tell your Admin.</p>
            {/* A full page load, since the app's own frame is what failed. */}
            <div className="row"><button type="button" className="btn primary" onClick={() => reset()}>Try again</button><a className="btn" href="/timesheet">Go to your timesheet</a></div>
          </section>
        </div>
      </body>
    </html>
  );
}
