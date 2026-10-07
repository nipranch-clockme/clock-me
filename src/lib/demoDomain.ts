/** Demo people (Settings > Demo data) all have an email at this made-up domain, so they are easy to find and never get real mail. */
export const DEMO_DOMAIN = "demo.timesink.example";
export const isDemoEmail = (email: string) => email.toLowerCase().endsWith("@" + DEMO_DOMAIN);
