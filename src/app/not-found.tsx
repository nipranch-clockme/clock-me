import Link from "next/link";

/** Shown for any address that does not exist, and for a client link that has been turned off. */
export default function NotFound() {
  return (
    <div className="login">
      <div className="brand"><h1>The Time Sink</h1></div>
      <section className="panel">
        <h2>Page not found</h2>
        <p className="sub">This page does not exist, or the link has been turned off. If someone sent you the link, ask them for a new one.</p>
        <Link className="btn primary" href="/dashboard">Go to the dashboard</Link>
      </section>
    </div>
  );
}
