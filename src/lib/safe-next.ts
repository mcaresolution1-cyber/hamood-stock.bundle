/**
 * Where to send the user back to after a redirect (`?next=`): only a path on THIS site.
 * Rejects absolute URLs, protocol-relative "//evil.com", backslash tricks and control characters,
 * so the route can't be used as an open redirect. Falls back to "/".
 */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || value.length > 2000) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  // Location headers must be plain ASCII (a decoded Arabic path would crash the response): encode it.
  if (/[^\x20-\x7e]/.test(value)) return encodeURI(value);
  return value;
}
