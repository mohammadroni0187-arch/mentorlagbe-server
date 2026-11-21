import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyToken, verifyTutor } from "../middlewares/verifyToken.js";

const router = express.Router();

const FREE_POST_LIMIT = 2;
const MODES = ["online", "offline", "hybrid"];

// regex-এর বিশেষ চিহ্ন escape করা (নইলে "C++" লিখলে error দেবে)
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const s = (value) => (typeof value === "string" ? value.trim() : "");

const tuitions = () => getDB().collection("tuitions");

/**
 * Create ar Update duto-r jonno shared validation.
 * Client theke asha kono field-e bharosha kora hoy na (approvalStatus, tutorId etc. ekhane nei).
 */
function parseTuitionBody(body = {}) {
  const title = s(body.title);
  const subject = s(body.subject);
  const classLevel = s(body.classLevel);
  const mode = s(body.mode).toLowerCase();
  const location = s(body.location);
  const description = s(body.description);
  const bannerImage = s(body.bannerImage);
  const monthlyFee = Number(body.monthlyFee ?? body.salary);
  const daysPerWeek = Number(body.daysPerWeek || 3);

  if (!title || !subject || !classLevel || !mode || !description) {
    return { error: "Please provide all required fields" };
  }
  if (title.length < 10 || title.length > 100) {
    return { error: "Title must be between 10 and 100 characters" };
  }
  if (description.length < 30 || description.length > 1000) {
    return { error: "Description must be between 30 and 1000 characters" };
  }
  if (!MODES.includes(mode)) {
    return { error: "Mode must be online, offline or hybrid" };
  }
  if (mode !== "online" && !location) {
    return { error: "Location is required for offline or hybrid tuition" };
  }
  if (!Number.isFinite(monthlyFee) || monthlyFee < 100) {
    return { error: "Monthly fee must be at least 100" };
  }
  if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) {
    return { error: "Days per week must be between 1 and 7" };
  }
  if (bannerImage && !/^https?:\/\//i.test(bannerImage)) {
    return { error: "Banner image must be a valid URL" };
  }

  return {
    data: {
      title,
      subject,
      classLevel,
      mode,
      location: mode === "online" ? "" : location,
      monthlyFee,
      daysPerWeek,
      description,
      bannerImage, // update-e khali thakle ager banner-i thakbe
    },
  };
}

// GET /api/tuitions?search=math&subject=Physics&classLevel=Class 10&mode=online&page=1&limit=9
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
    if (subject) query.subject = { $regex: new RegExp(`^${escapeRegex(subject)}$`, "i") };
    if (classLevel) query.classLevel = { $regex: new RegExp(`^${escapeRegex(classLevel)}$`, "i") };
    if (mode) query.mode = { $regex: new RegExp(`^${escapeRegex(mode)}$`, "i") };

    let sortOption = { createdAt: -1 };
    if (req.query.sort === "fee_asc") {
      sortOption = { monthlyFee: 1, salary: 1 };
    } else if (req.query.sort === "fee_desc") {
      sortOption = { monthlyFee: -1, salary: -1 };
    }

    const [data, total] = await Promise.all([
      tuitions()
        .find(query)
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      tuitions().countDocuments(query),
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
// দ্রষ্টব্য: /:id-এর আগে থাকতে হবে
router.get("/latest", async (req, res) => {
  try {
    const data = await tuitions()
      .find({ approvalStatus: "approved", isActive: true })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch latest tuitions" });
  }
});

// GET /api/tuitions/my  (tutor-er nijer shob post)
// দ্রষ্টব্য: eta top-level route hote hobe ar /:id-er AGE thakte hobe,
// noile "my" ke id dhore /:id-te cole jabe ("Invalid tuition id").
router.get("/my", verifyToken, verifyTutor, async (req, res) => {
  try {
    const data = await tuitions()
      .find({ tutorId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({ success: true, data, total: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch your tuitions" });
  }
});

// GET /api/tuitions/:id
router.get("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid tuition id" });
    }

    const tuition = await tuitions().findOne({
      _id: new ObjectId(req.params.id),
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
router.post("/", verifyToken, verifyTutor, async (req, res) => {
  try {
    const { data: parsed, error } = parseTuitionBody(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error,
      });
    }

    const db = getDB();

    // Find logged-in tutor
    if (!ObjectId.isValid(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tutor ID",
      });
    }

    const tutor = await db.collection("user").findOne({
      _id: new ObjectId(req.user.id),
    });

    if (!tutor) {
      return res.status(404).json({
        success: false,
        message: "Tutor account not found",
      });
    }

    // Free plan: Maximum 2 tuition posts
    const currentPlan = tutor.plan || "free";

    if (currentPlan === "free") {
      const totalPosts = await db.collection("tuitions").countDocuments({
        tutorId: req.user.id,
      });

      if (totalPosts >= FREE_POST_LIMIT) {
        return res.status(403).json({
          success: false,
          message: `Free plan allows maximum ${FREE_POST_LIMIT} tuition posts. Upgrade your plan.`,
        });
      }
    }

    // Create tuition
    const newTuition = {
      title: parsed.title,
      subject: parsed.subject,
      classLevel: parsed.classLevel,
      location: parsed.location,
      mode: parsed.mode,
      monthlyFee: parsed.monthlyFee,
      salary: parsed.monthlyFee,
      daysPerWeek: parsed.daysPerWeek,
      description: parsed.description,
      bannerImage: parsed.bannerImage || "",

      tutorId: req.user.id,
      tutorName: tutor.name,
      tutorEmail: tutor.email,

      // New posts start active but stay invisible publicly until approved.
      approvalStatus: "pending",
      isActive: true,
      createdAt: new Date(),
    };

    const result = await db.collection("tuitions").insertOne(newTuition);

    return res.status(201).json({
      success: true,
      message: "Tuition created successfully",
      data: {
        _id: result.insertedId,
        ...newTuition,
      },
    });
  } catch (error) {
    console.error("Create tuition error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create tuition",
    });
  }
});

// PATCH /api/tuitions/:id/status  { isActive: boolean }  (Active / Closed toggle)
router.patch("/:id/status", verifyToken, verifyTutor, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid tuition id" });
    }
    if (typeof req.body.isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "isActive must be true or false" });
    }

    const result = await tuitions().updateOne(
      { _id: new ObjectId(req.params.id), tutorId: req.user.id },
      { $set: { isActive: req.body.isActive, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Tuition not found" });
    }

    res.status(200).json({ success: true, message: "Status updated", isActive: req.body.isActive });
  } catch (error) {
    console.error("Toggle tuition status error:", error);
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
});

// PATCH /api/tuitions/:id  (Edit)
router.patch("/:id", verifyToken, verifyTutor, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid tuition id" });
    }

    const { data, error } = parseTuitionBody(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const { bannerImage, ...fields } = data;

    const filter = { _id: new ObjectId(req.params.id), tutorId: req.user.id };

    const result = await tuitions().updateOne(filter, {
      $set: {
        ...fields,
        ...(bannerImage ? { bannerImage } : {}),
        // Edit korle abar admin review lagbe (approved/rejected, duto-i pending hoye jay).
        // Eta na chaile ei duto line muche din.
        approvalStatus: "pending",
        rejectionReason: "",
        updatedAt: new Date(),
      },
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Tuition not found" });
    }

    const updated = await tuitions().findOne(filter);
    res.status(200).json({ success: true, message: "Tuition updated", data: updated });
  } catch (error) {
    console.error("Update tuition error:", error);
    res.status(500).json({ success: false, message: "Failed to update tuition" });
  }
});



// DELETE /api/tuitions/:id
router.delete("/:id", verifyToken, verifyTutor, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tuition id",
      });
    }

    const db = getDB();
    const tuitionId = new ObjectId(id);

    const tuition = await db.collection("tuitions").findOne({
      _id: tuitionId,
      tutorId: req.user.id,
    });

    if (!tuition) {
      return res.status(404).json({
        success: false,
        message: "Tuition not found",
      });
    }

    // Related applications are removed, but each student's lifetime usage
    // counter is intentionally left untouched.
    await db.collection("applications").deleteMany({
      tuitionId: { $in: [tuitionId, id] },
    });

    
    await db.collection("tuitions").deleteOne({
      _id: tuitionId,
      tutorId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      message: "Tuition and related applications deleted successfully",
    });
  } catch (error) {
    console.error("Delete tuition error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete tuition",
    });
  }
});


export default router;