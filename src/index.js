
import express from "express";
import cors from "cors";
import "dotenv/config";
import tuitionRoutes from "./routes/tuition.routes.js"
import { connectDB } from "./config/db.js";

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use("/api/tuitions", tuitionRoutes)

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

// Health Check API
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to MentorLagbe API",
  });
});

// Start Server
const startServer = async () => {
  try {
    await connectDB();

    app.listen(port, () => {
      console.log(`MentorLagbe Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
