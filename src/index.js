import express from "express";
import cors from "cors";
import "dotenv/config";

import { toNodeHandler } from "better-auth/node";
import { createAuth } from "../auth/auth.js";

import tuitionRoutes from "./routes/tuition.routes.js";
import { connectDB } from "./config/db.js";
import adminRoutes from "./routes/admin.routes.js";
import applicationRoutes from "./routes/applications.routes.js";
import profileRoutes from './routes/profile.routes.js'
import uploadRoutes from './routes/upload.routes.js'
import paymentRoutes,{stripeWebhookHandler,} from './routes/payment.routes.js'




const app = express();
const port = process.env.PORT || 5000;

// Middleware - allow both configured client URLs so production and local dev
// never hit CORS errors when they differ.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.AUTH_BASE_URL,
  "http://localhost:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // No ACAO header -> browser blocks the request cleanly, no server crash.
      return callback(null, false);
    },
    credentials: true,
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