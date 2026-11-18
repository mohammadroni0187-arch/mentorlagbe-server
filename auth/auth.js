
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt, role } from "better-auth/plugins";

export const createAuth = (db) => {
  return betterAuth({
    database: mongodbAdapter(db),

    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,

    trustedOrigins: [
      "http://localhost:3000",
    ],

    emailAndPassword: {
      enabled: true,
    },
    user:{
      additionalFields:{
        role:{
            type:"string",
            required:false,
            defaultValue:"student",
            input:false,
        }
      }
    },

    plugins: [
      jwt({
        jwt:{
          definePayload:({user})=>({
            id:user.id,
            email:user.email,
            name:user.name,
            role:user.role,
          }),
        },
      }),
    ],
  });
};
