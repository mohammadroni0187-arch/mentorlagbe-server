import express from "express";
import cors from "cors";
import "dotenv/config";

import { toNodeHandler } from "better-auth/node";
import { createAuth } from "../auth/auth.js";

import tuitionRoutes from "./routes/tuition.routes.js";
import { connectDB } from "./config/db.js";
import adminRoutes from "./routes/admin.routes.js";
import applicationRoutes from "./routes/applications.routes.js";

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.AUTH_BASE_URL || "http://localhost:3000",
    credentials: true,
  })
);

const startServer = async () => {
  try {
    const db = await connectDB();
    const auth = createAuth(db);

    // Better Auth
    app.all("/api/auth/*splat", toNodeHandler(auth));

    // JSON Middleware
    app.use(express.json());

    // API Routes
    app.use("/api/tuitions", tuitionRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/applications", applicationRoutes);

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
  }
};

startServer();