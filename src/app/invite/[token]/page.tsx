import { db } from "@/lib/db";
import InviteForm from "./InviteForm";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await db.user.findUnique({ where: { inviteToken: token } });
  return (
    <div className="login">
      <div className="brand" style={{ marginBottom: 20 }}><h1>Clock me</h1></div>
      <section className="panel">
        {user ? (<><h2>{user.passwordHash ? "Reset your password" : `Welcome, ${user.name}`}</h2><p className="sub">{user.passwordHash ? `Choose a new password for ${user.email}.` : "Choose a password to finish setting up your account."}</p><InviteForm token={token} /></>)
          : (<><h2>Invite not valid</h2><p className="sub">This link has already been used or has expired. Ask your admin for a new one.</p></>)}
      </section>
    </div>
  );
}
