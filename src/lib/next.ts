/**
 * A path inside this app that it's safe to send someone to after they sign in, or null. Refuses anything that could
 * lead off the site (such as "//host" or "/\host"), anything with a backslash or control character, anything over
 * 300 characters, and the sign-in and set-up pages themselves.
 */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /\p{Cc}/u.test(value)) return null;
  // Checked again as the browser reads it, so "/./login" or "/%2e/login" can't get past the rules above.
  const path = new URL(value, "http://localhost").pathname;
  if (path.startsWith("//") || SIGN_IN_OR_SET_UP.test(value) || SIGN_IN_OR_SET_UP.test(path)) return null;
  return value;
}

const SIGN_IN_OR_SET_UP = /^\/(login|setup|invite)/;
