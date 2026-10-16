import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { safeNext } from "@/lib/next";
import LoginForm from "./LoginForm";
import Logo from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string | string[]; next?: string | string[] }> }) {
  if ((await db.user.count()) === 0) redirect("/setup"); // brand-new install
  const params = await searchParams;
  const ended = params.reason === "ended"; // sent here because their sign-in stopped working
  const next = safeNext(params.next); // where to go after signing in, when it's a page of this app
  return (
    <div className="login">
      <div className="brand" style={{ marginBottom: 20 }}><Logo id="logo-brand" className="brandlogo" /><h1>The Time Sink</h1></div>
      <section className="panel">
        <h2>Sign in</h2>
        {ended && <p className="alert info" role="status">Your session has ended. Sign in again to continue.</p>}
        <p className="sub">Use the email your Admin invited you with.</p>
        <LoginForm next={next} />
        <p className="note" style={{ margin: "14px 0 0" }}><Link href="/login/forgot">Forgot your password?</Link></p>
      </section>
    </div>
  );
}
