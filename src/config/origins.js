/**
 * Single source of truth for browser origins allowed to call this API.
 *
 * Older Vercel env values were stored as bare hostnames
 * (e.g. "mentorlagbe-client-one.vercel.app"), but browsers always send a full
 * origin including the scheme ("https://..."). Normalize both forms so CORS
 * and Better Auth agree on the exact same list.
 */

const normalizeOrigin = (value) => {
  if (!value) return null;

  const trimmed = String(value).trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  // Already has a scheme (http/https) -> keep it as-is.
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Bare hostname from legacy env vars -> treat as https.
  return `https://${trimmed}`;
};

export const allowedOrigins = [
  ...new Set(
    [
      process.env.FRONTEND_URL,
      process.env.AUTH_BASE_URL,
      // Explicit production frontend origin (kept even if env is missing).
      "https://mentorlagbe-client-one.vercel.app",
      // Local development origin - must keep working.
      "http://localhost:3000",
    ]
      .map(normalizeOrigin)
      .filter(Boolean)
  ),
];
