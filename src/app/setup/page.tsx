import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import SetupForm from "./SetupForm";
import { databasePassword } from "@/lib/ownerCheck";
import Logo from "@/components/Logo";

export const dynamic = "force-dynamic";

// First visit to a new install: create the first admin. Once anyone has an account, this page is closed.
export default async function SetupPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  return (
    <div className="login">
      <div className="brand" style={{ marginBottom: 20 }}><Logo id="logo-brand" className="brandlogo" /><h1>The Time Sink</h1></div>
      <section className="panel">
        <h2>Set up The Time Sink</h2>
        <p className="sub">Create your Admin account. You can add more offices, teams and people once you&apos;re in.</p>
        <SetupForm needsProof={!!databasePassword()} />
      </section>
    </div>
  );
}
