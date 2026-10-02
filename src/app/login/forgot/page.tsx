import Link from "next/link";
import ForgotForm from "./ForgotForm";

export default function ForgotPage() {
  return (
    <div className="login">
      <div className="brand" style={{ marginBottom: 20 }}><h1>Clock me</h1></div>
      <section className="panel">
        <h2>Forgot your password?</h2>
        <p className="sub">Enter your work email and we&apos;ll send you a link to choose a new one.</p>
        <ForgotForm />
        <p className="note" style={{ margin: "14px 0 0" }}><Link href="/login">Back to sign in</Link></p>
      </section>
    </div>
  );
}
