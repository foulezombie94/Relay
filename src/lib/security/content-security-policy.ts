type PolicyOptions = {
  nonce: string;
  databaseUrl: string;
  sentryDsn?: string;
  development: boolean;
};

/** Only trusted deployment configuration may contribute network origins. */
export function contentSecurityPolicy(options: PolicyOptions) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(options.nonce)) throw new Error("Invalid CSP nonce");
  const database = new URL(options.databaseUrl);
  const connections = new Set(["'self'", database.origin]);
  if (options.sentryDsn) {
    const sentry = new URL(options.sentryDsn);
    if (sentry.protocol !== "https:") throw new Error("Sentry CSP requires HTTPS");
    connections.add(sentry.origin);
  }
  if (options.development) {
    connections.add("ws://localhost:*");
    connections.add("ws://127.0.0.1:*");
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'${options.development ? " 'unsafe-eval'" : ""}`,
    // React, Radix and charts position elements with inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "font-src 'self'",
    `connect-src ${[...connections].join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    ...(!options.development && database.protocol === "https:"
      ? ["upgrade-insecure-requests"]
      : []),
  ].join("; ");
}
