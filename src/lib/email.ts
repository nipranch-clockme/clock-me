// Sends email through Resend when RESEND_API_KEY is set. Without it, emails are only written to the server log,
// so reminders work end to end in development and can be switched on later by adding the key.
export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendEmail(to: string, subject: string, text: string): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email not configured] To: ${to} | ${subject}\n${text}`);
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Clock me <onboarding@resend.dev>", to, subject, text }),
  });
  return res.ok ? { sent: true } : { sent: false, error: `Email service said ${res.status}` };
}

export const appUrl = () =>
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
