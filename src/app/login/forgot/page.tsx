import Link from "next/link";
import { emailConfigured } from "@/lib/email";
import ForgotForm from "./ForgotForm";

// Checks the email setting on each visit, so adding RESEND_API_KEY in Vercel turns self-service resets on.
export const dynamic = "force-dynamic";

export default function ForgotPage() {
  const email = emailConfigured();
  return (
    <div className="login">
      <div className="brand" style={{ marginBottom: 20 }}><h1>The Time Sink</h1></div>
      <section className="panel">
        <h2>Forgot your password?</h2>
        {email ? (
          <>
            <p className="sub">Enter your work email and we&apos;ll send you a link to choose a new one.</p>
            <ForgotForm />
          </>
        ) : (
          <p className="sub" role="status">Ask your admin or location manager for a reset link. They can make one on the People page.</p>
        )}
        <p className="note" style={{ margin: "14px 0 0" }}><Link href="/login">Back to sign in</Link></p>
      </section>
    </div>
  );
}
