
import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = express.Router();

// GET: Logged-in user profile
router.get("/", verifyToken, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await getDB().collection("user").findOne(
      { _id: new ObjectId(req.user.id) },
      {
        projection: {
          name: 1,
          email: 1,
          image: 1,
          role: 1,
          phone: 1,
          bio: 1,
          plan: 1,
          createdAt: 1,
        },
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
});

// PATCH: Update logged-in user profile
router.patch("/", verifyToken, async (req, res) => {
  try {
    const { name, phone, bio, image } = req.body;

    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Name is required",
        });
      }
      updateData.name = name.trim();
    }

    if (phone !== undefined) {
      if (typeof phone !== "string" || phone.length > 30) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number",
        });
      }
      updateData.phone = phone.trim();
    }

    if (bio !== undefined) {
      if (typeof bio !== "string" || bio.length > 1000) {
        return res.status(400).json({
          success: false,
          message: "Invalid bio",
        });
      }
      updateData.bio = bio.trim();
    }

    if (image !== undefined) {
      if (typeof image !== "string" || image.length > 2000) {
        return res.status(400).json({
          success: false,
          message: "Invalid image URL",
        });
      }
      updateData.image = image.trim();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No profile fields provided",
      });
    }

    updateData.updatedAt = new Date();

    const result = await getDB().collection("user").updateOne(
      { _id: new ObjectId(req.user.id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
});

export default router;
