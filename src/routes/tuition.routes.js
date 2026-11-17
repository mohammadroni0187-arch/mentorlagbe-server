import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const router = express.Router();

// regex-এর বিশেষ চিহ্ন escape করা (নইলে "C++" লিখলে error দেবে)
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/tuitions?search=math&subject=Physics&classLevel=Class 10&mode=Online&page=1&limit=9
router.get("/", async (req, res) => {
  try {
    const { search, subject, classLevel, mode } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 9, 50);

    const query = { approvalStatus: "approved", isActive: true };

    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      query.$or = [{ title: regex }, { subject: regex }];
    }
    if (subject) query.subject = subject;
    if (classLevel) query.classLevel = classLevel;
    if (mode) query.mode = mode;

    const collection = getDB().collection("tuitions");

    const [data, total] = await Promise.all([
      collection
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch tuitions" });
  }
});

// GET /api/tuitions/latest  (Home page-এর ৬টা card)
// দ্রষ্টব্য: এটা /:id-এর আগে থাকতে হবে, নইলে "latest" কে id ধরে নেবে
router.get("/latest", async (req, res) => {
  try {
    const data = await getDB()
      .collection("tuitions")
      .find({ approvalStatus: "approved", isActive: true })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch latest tuitions" });
  }
});

// GET /api/tuitions/:id
router.get("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid tuition id" });
    }

    const tuition = await getDB()
      .collection("tuitions")
      .findOne({
  _id: new ObjectId(req.params.id),
  approvalStatus: "approved",
  isActive: true,
});

    if (!tuition) {
      return res.status(404).json({ success: false, message: "Tuition not found" });
    }

    res.status(200).json({ success: true, data: tuition });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch tuition" });
  }
});

// POST /api/tuitions - Create a new tuition
router.post("/", async (req, res) => {
  try {
    const {
      title,
      subject,
      classLevel,
      location,
      mode,
      salary,
      description,
    } = req.body;

    // Validate required fields
    if (
      !title ||
      !subject ||
      !classLevel ||
      !location ||
      !mode ||
      !salary
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    const newTuition = {
      title,
      subject,
      classLevel,
      location,
      mode,
      salary: Number(salary),
      description: description || "",
      approvalStatus: "pending",
      isActive: false,
      createdAt: new Date(),
    };

    const result = await getDB()
      .collection("tuitions")
      .insertOne(newTuition);

    res.status(201).json({
      success: true,
      message: "Tuition created successfully",
      data: {
        _id: result.insertedId,
        ...newTuition,
      },
    });
  } catch (error) {
    console.error("Create tuition error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create tuition",
    });
  }
});

export default router;