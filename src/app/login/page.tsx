import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string | string[] }> }) {
  if ((await db.user.count()) === 0) redirect("/setup"); // brand-new install
  const ended = (await searchParams).reason === "ended"; // sent here because their sign-in stopped working
  return (
    <div className="login">
      <div className="brand" style={{ marginBottom: 20 }}><h1>The Time Sink</h1></div>
      <section className="panel">
        <h2>Sign in</h2>
        {ended && <p className="alert info" role="status">Your session has ended. Sign in again to continue.</p>}
        <p className="sub">Use the email your Admin invited you with.</p>
        <LoginForm />
        <p className="note" style={{ margin: "14px 0 0" }}><Link href="/login/forgot">Forgot your password?</Link></p>
      </section>
    </div>
  );
}
