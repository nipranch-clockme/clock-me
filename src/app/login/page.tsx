import Link from "next/link";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="login">
      <div className="brand" style={{ marginBottom: 20 }}><h1>Clock me</h1></div>
      <section className="panel">
        <h2>Sign in</h2>
        <p className="sub">Use the email your admin invited you with.</p>
        <LoginForm />
        <p className="note" style={{ margin: "14px 0 0" }}><Link href="/login/forgot">Forgot your password?</Link></p>
      </section>
    </div>
  );
}
