
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt } from "better-auth/plugins";
import { allowedOrigins } from "../src/config/origins.js";

// Local dev (http://localhost) must keep using plain, non-secure cookies.
// In production the frontend and backend live on different vercel.app
// subdomains, which are DIFFERENT sites (vercel.app is on the Public Suffix
// List). A SameSite=lax session cookie would therefore never be sent back on
// the cross-origin /get-session call, so the dashboard guard sees no user and
// bounces to /signIn. SameSite=none + secure is required there.
// No `Domain` is set on purpose: vercel.app is a public suffix, so such a
// cookie would be rejected by browsers.
const isProduction = process.env.NODE_ENV === "production";

export const createAuth = (db) => {
  return betterAuth({
    database: mongodbAdapter(db),

    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,

    // Better Auth validates the Origin header against this list itself, so it
    // must contain the full production origin (with scheme) and localhost.
    trustedOrigins: allowedOrigins,

    advanced: {
      defaultCookieAttributes: {
        sameSite: isProduction ? "none" : "lax",
        secure: isProduction,
      },
    },

    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
  google: {
    clientId: process.env.GOOGLE_URI,
    clientSecret: process.env.GOOGLE_SECRET,
  },
},

    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "student",
          input: true,
        },
        phone: {
          type: "string",
          required: false,
          defaultValue: "",
          input: true,
        },
        bio: {
          type: "string",
          required: false,
          defaultValue: "",
          input: true,
        },
        plan: {
          type: "string",
          required: false,
          defaultValue: "free",
          input: false,
        },
      },
    },

    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // Strict role restriction: new signups can only be 'tutor' or 'student'
            const role = user.role === "tutor" ? "tutor" : "student";
            const plan = "free";

            return {
              data: {
                ...user,
                role,
                plan,
                phone: typeof user.phone === "string" ? user.phone : "",
                bio: typeof user.bio === "string" ? user.bio : "",
              },
            };
          },
        },
      },
    },

    plugins: [
      jwt({
        jwt: {
          definePayload: ({ user }) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role || "student",
            plan: user.plan || "free",
          }),
        },
      }),
    ],
  });
};
