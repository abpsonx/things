/**
 * Browser error monitoring (Sentry) — only initialized when
 * NEXT_PUBLIC_SENTRY_DSN is set. Safe no-op otherwise so dev/local builds
 * without the env var don't fail.
 */
let initialized = false;

export async function initSentry(userId?: string, email?: string) {
  if (initialized || typeof window === "undefined") return;
  const dsn = (process.env.NEXT_PUBLIC_SENTRY_DSN || "").trim();
  if (!dsn) return;
  try {
    // The package is installed via package.json; the cast keeps TS happy in
    // environments where node_modules hasn't been installed yet (CI pre-install).
    const Sentry: any = await import(/* webpackIgnore: true */ "@sentry/browser" as any);
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_ENV || "production",
      tracesSampleRate: 0, // tracing off — only error capture, keep quota lean
      // Strip query strings & avoid sending too much PII.
      sendDefaultPii: false,
      ignoreErrors: [
        // Browser/extension noise we don't care about.
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications",
        /^Network Error$/,
        /^AbortError/,
      ],
    });
    if (userId) {
      Sentry.setUser({ id: userId, ...(email ? { email } : {}) });
    }
    initialized = true;
  } catch (err) {
    // Don't crash the app if Sentry fails to load.
    console.warn("[sentry] init failed", err);
  }
}
