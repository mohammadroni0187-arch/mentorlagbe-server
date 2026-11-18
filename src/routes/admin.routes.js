
import express from "express";
import {
  verifyToken,
  verifyTutor,
  verifyAdmin,
} from "../middlewares/verifyToken.js";

const router = express.Router();

// Tutor test
router.get("/tutor-test", verifyToken, verifyTutor, (req, res) => {
  res.json({
    success: true,
    message: "Tutor access granted",
    user: req.user,
  });
});

// Admin test
router.get("/test", verifyToken, verifyAdmin, (req, res) => {
  res.json({
    success: true,
    message: "Admin access granted",
    user: req.user,
  });
});

export default router;
