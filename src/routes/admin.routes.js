import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyAdmin, verifyToken } from "../middlewares/verifyToken.js";

const router = express.Router();

// GET /api/admin/tuitions/pending
router.get("/tuitions/pending", async (req, res) => {
  try {
    const data = await getDB()
      .collection("tuitions")
      .find({ approvalStatus: "pending" })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch pending tuitions",
    });
  }
});

// PATCH /api/admin/tuitions/:id/approve
router.patch("/tuitions/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tuition ID",
      });
    }

    const result = await getDB()
      .collection("tuitions")
      .updateOne(
        {
          _id: new ObjectId(id),
          approvalStatus: "pending",
        },
        {
          $set: {
            approvalStatus: "approved",
            isActive: true,
            updatedAt: new Date(),
          },
        }
      );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending tuition not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Tuition approved successfully",
    });
  } catch (error) {
    console.error("Approve tuition error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to approve tuition",
    });
  }
});

// PATCH /api/admin/tuitions/:id/reject
router.patch("/tuitions/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tuition ID",
      });
    }

    const result = await getDB()
      .collection("tuitions")
      .updateOne(
        {
          _id: new ObjectId(id),
          approvalStatus: "pending",
        },
        {
          $set: {
            approvalStatus: "rejected",
            isActive: false,
            updatedAt: new Date(),
          },
        }
      );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending tuition not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Tuition rejected successfully",
    });
  } catch (error) {
    console.error("Reject tuition error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to reject tuition",
    });
  }
});
router.get("/test", verifyToken, verifyAdmin,(req,res)=>{
  res.json({
    success:true,
    message:"Welcome Admin",
    user:req.user,
  });
});
export default router;