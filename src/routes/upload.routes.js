
import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = express.Router();

// POST: Upload profile image
router.post("/", verifyToken, async (req, res) => {
  try {
    const { image } = req.body;

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }

    if (!process.env.IMGBB_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "Image upload configuration missing",
      });
    }

    if (!ObjectId.isValid(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    // Remove Base64 data URL prefix
    const base64Image = image.replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      ""
    );

    if (base64Image.length > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Image is too large",
      });
    }

    const formData = new FormData();
    formData.append("image", base64Image);

    const response = await fetch(
      `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
      {
        method: "POST",
        body: formData,
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      return res.status(400).json({
        success: false,
        message: "Image upload failed",
      });
    }

    const imageUrl = result.data.display_url;

    await getDB().collection("user").updateOne(
      { _id: new ObjectId(req.user.id) },
      {
        $set: {
          image: imageUrl,
          updatedAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Profile image uploaded successfully",
      data: {
        image: imageUrl,
      },
    });
  } catch (error) {
    console.error("Image Upload Error:", error);

    return res.status(500).json({
      success: false,
      message: "Image upload failed",
    });
  }
});

export default router;
