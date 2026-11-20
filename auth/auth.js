
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt } from "better-auth/plugins";

export const createAuth = (db) => {
  return betterAuth({
    database: mongodbAdapter(db),

    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,

    trustedOrigins: ["http://localhost:3000"],

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
