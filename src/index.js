import express from "express";
import cors from "cors";
import "dotenv/config";

import { toNodeHandler } from "better-auth/node";
import { createAuth } from "../auth/auth.js";

import tuitionRoutes from "./routes/tuition.routes.js";
import { connectDB } from "./config/db.js";
import { allowedOrigins } from "./config/origins.js";
import adminRoutes from "./routes/admin.routes.js";
import applicationRoutes from "./routes/applications.routes.js";
import profileRoutes from './routes/profile.routes.js'
import uploadRoutes from './routes/upload.routes.js'
import paymentRoutes,{stripeWebhookHandler,} from './routes/payment.routes.js'




const app = express();
const port = process.env.PORT || 5000;

// CORS must run BEFORE Better Auth and every other API route. This way OPTIONS
// preflight requests are answered here with the proper headers and never reach
// the auth handler / protected routes.
app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header (curl, server-to-server, same-origin) is allowed.
      // For browser requests, echo back only known origins - never "*" because
      // credentials (cookies) are involved.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Unknown origin -> no ACAO header, browser blocks it cleanly.
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"],
    optionsSuccessStatus: 204,
  })
);

const startServer = async () => {
  try {
    const db = await connectDB();
    const auth = createAuth(db);

    // Better Auth
    app.all("/api/auth/*splat", toNodeHandler(auth));

    app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

    // JSON Middleware
    app.use(express.json({ limit: "7mb" }));

    // API Routes
    app.use("/api/tuitions", tuitionRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/applications", applicationRoutes);
    app.use("/api/profile", profileRoutes);
    app.use("/api/profile/upload-image", uploadRoutes);
    app.use("/api/payments", paymentRoutes);

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
  }
};

startServer();