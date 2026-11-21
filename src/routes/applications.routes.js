
import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import {
  verifyToken,
  verifyStudent,
  verifyTutor,
} from "../middlewares/verifyToken.js";

const router = express.Router();

const applications = () => getDB().collection("applications");
const tuitions = () => getDB().collection("tuitions");
const applicationUsage = () => getDB().collection("applicationUsage");

// Free-plan students may submit at most 2 applications. This mirrors the
// existing tutor free-post policy: a lifetime count with no reset period and
// no artificial limit for Pro users.
const FREE_APPLICATION_LIMIT = 2;
const FREE_LIMIT_MESSAGE =
  "You have reached your free application limit. Upgrade to Pro to submit more applications.";

// Only an explicit Pro plan is unlimited. Missing, legacy or differently
// cased values must never accidentally bypass the free tier.
const isProPlan = (plan) =>
  typeof plan === "string" &&
  ["pro", "premium"].includes(plan.trim().toLowerCase());

// A unique index makes duplicate detection race-safe. Legacy duplicates, if
// any, must not prevent the server from starting.
let indexPromise;
const ensureApplicationIndexes = () => {
  if (!indexPromise) {
    indexPromise = applications()
      .createIndex(
        { studentId: 1, tuitionId: 1 },
        { unique: true, name: "uniq_student_tuition" }
      )
      .then(() => true)
      .catch((error) => {
        console.warn("Could not create application dedupe index:", error.message);
        indexPromise = undefined;
        return false;
      });
  }
  return indexPromise;
};

// The plan must come from the database: JWT claims can be stale right after a
// Stripe checkout or webhook updates the user document.
const findStudent = async (studentId) => {
  if (!ObjectId.isValid(studentId)) return null;
  return getDB().collection("user").findOne(
    { _id: new ObjectId(studentId) },
    { projection: { plan: 1 } }
  );
};

/**
 * Persistent lifetime usage counter. It is never reduced on cancellation or
 * rejection, so cancelling or a tutor rejecting an application cannot restore
 * a free student's quota. Existing students are migrated from their current
 * application documents the first time they apply after this version is live.
 */
const ensureUsageDocument = async (studentId) => {
  const existing = await applicationUsage().findOne(
    { _id: studentId },
    { projection: { count: 1 } }
  );
  if (existing) return existing;

  const legacyCount = await applications().countDocuments({ studentId });

  await applicationUsage().updateOne(
    { _id: studentId },
    {
      $setOnInsert: {
        studentId,
        count: legacyCount,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return applicationUsage().findOne(
    { _id: studentId },
    { projection: { count: 1 } }
  );
};

/**
 * Atomically reserve one lifetime application. For free students the filtered
 * update fails once the cap is reached, which also makes concurrent requests
 * safe. Pro students get an unconditional increment.
 */
const reserveApplicationUsage = async (studentId, isPro) => {
  await ensureUsageDocument(studentId);

  if (isPro) {
    await applicationUsage().updateOne(
      { _id: studentId },
      { $inc: { count: 1 }, $set: { updatedAt: new Date() } }
    );
    return true;
  }

  const result = await applicationUsage().findOneAndUpdate(
    { _id: studentId, count: { $lt: FREE_APPLICATION_LIMIT } },
    { $inc: { count: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  return !!result;
};

// Only used when an application was NOT saved (e.g. duplicate request).
const releaseApplicationUsage = async (studentId) => {
  await applicationUsage().updateOne(
    { _id: studentId, count: { $gt: 0 } },
    { $inc: { count: -1 }, $set: { updatedAt: new Date() } }
  );
};

const s = (value) =>
  typeof value === "string" ? value.trim() : "";

// 1. Student: Apply for a tuition
router.post("/", verifyToken, verifyStudent, async (req, res) => {
  try {
    const tuitionId = s(req.body.tuitionId);
    const preferredSchedule =
      req.body.preferredSchedule ?? req.body.schedule;
    const note = s(req.body.note);
    const phone = s(req.body.phone);

    if (!ObjectId.isValid(tuitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tuition ID",
      });
    }

    if (
      typeof preferredSchedule !== "string" ||
      !preferredSchedule.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Preferred schedule is required",
      });
    }

    if (note.length > 1000 || phone.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Note or phone number is too long",
      });
    }

    const tuition = await tuitions().findOne({
      _id: new ObjectId(tuitionId),
      approvalStatus: "approved",
      isActive: true,
    });

    if (!tuition) {
      return res.status(404).json({
        success: false,
        message: "Tuition not found or not available",
      });
    }

    if (tuition.tutorId === req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You cannot apply to your own tuition",
      });
    }

    const alreadyApplied = await applications().findOne({
      tuitionId: new ObjectId(tuitionId),
      studentId: req.user.id,
    });

    if (alreadyApplied) {
      return res.status(409).json({
        success: false,
        message: "You have already applied to this tuition",
      });
    }

    await ensureApplicationIndexes();

    const student = await findStudent(req.user.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student account not found",
      });
    }

    const currentPlan = student.plan || "free";
    const isPro = isProPlan(currentPlan);
    const applicationId = new ObjectId();

    // Reserve the lifetime usage atomically before writing the application.
    if (!(await reserveApplicationUsage(req.user.id, isPro))) {
      return res.status(403).json({
        success: false,
        code: "FREE_APPLICATION_LIMIT",
        message: FREE_LIMIT_MESSAGE,
      });
    }

    const newApplication = {
      _id: applicationId,
      tuitionId: new ObjectId(tuitionId),
      tuitionTitle: tuition.title,
      monthlyFee: tuition.monthlyFee ?? tuition.salary ?? 0,

      studentId: req.user.id,
      studentName: req.user.name,
      studentEmail: req.user.email,
      studentPhone: phone,

      tutorId: tuition.tutorId,
      tutorName: tuition.tutorName,
      tutorEmail: tuition.tutorEmail,

      preferredSchedule: preferredSchedule.trim(),
      note,

      status: "pending",
      createdAt: new Date(),
    };

    try {
      await applications().insertOne(newApplication);
    } catch (error) {
      // The application was not saved, so this request is not part of the
      // lifetime usage. Failed/rejected API requests must not count.
      await releaseApplicationUsage(req.user.id);

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "You have already applied to this tuition",
        });
      }

      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      data: newApplication,
    });
  } catch (error) {
    console.error("Create application error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit application",
    });
  }
});

// Student Dashboard Statistics
router.get(
  "/student/stats",
  verifyToken,
  verifyStudent,
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const student = await findStudent(studentId);
      const currentPlan = student?.plan || "free";
      const isPro = isProPlan(currentPlan);

      const usage = await ensureUsageDocument(studentId);
      const totalApplied = usage?.count || 0;

      const [activeApplications, accepted, pending] = await Promise.all([
        applications().countDocuments({ studentId }),

        applications().countDocuments({
          studentId,
          status: "accepted",
        }),

        applications().countDocuments({
          studentId,
          status: "pending",
        }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          // Lifetime successful submissions (never reset by cancel/reject).
          totalApplied,
          activeApplications,
          accepted,
          pending,
          currentPlan,
          freeApplicationLimit: FREE_APPLICATION_LIMIT,
          freeApplicationsUsed: Math.min(totalApplied, FREE_APPLICATION_LIMIT),
          // Pro has no application limit, so null means unlimited here.
          remainingFreeApplications: isPro
            ? null
            : Math.max(0, FREE_APPLICATION_LIMIT - totalApplied),
          canApply: isPro || totalApplied < FREE_APPLICATION_LIMIT,
        },
      });
    } catch (error) {
      console.error("Student Stats Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch student statistics",
      });
    }
  }
);

// 2. Student: Get own applications
router.get("/student", verifyToken, verifyStudent, async (req, res) => {
  try {
    const data = await applications()
      .find({ studentId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      data,
      total: data.length,
    });
  } catch (error) {
    console.error("Fetch student applications error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch applications",
    });
  }
});



// 3. Student: Cancel own pending application
router.delete("/:id", verifyToken, verifyStudent, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application ID",
      });
    }

    const result = await applications().deleteOne({
      _id: new ObjectId(id),
      studentId: req.user.id,
      status: "pending",
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending application not found",
      });
    }

    // Lifetime usage is intentionally NOT reduced: cancelling a pending
    // application does not restore a free student's application quota.
    return res.status(200).json({
      success: true,
      message: "Application cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel application error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel application",
    });
  }
});

// Tutor Dashboard Statistics
router.get(
  "/tutor/stats",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    try {
      const tutorId = req.user.id;

      const [totalTuitions, activeTuitions, totalApplicants] =
        await Promise.all([
          tuitions().countDocuments({ tutorId }),

          tuitions().countDocuments({
            tutorId,
            approvalStatus: "approved",
            isActive: true,
          }),

          applications().countDocuments({ tutorId }),
        ]);

      return res.status(200).json({
        success: true,
        data: {
          totalTuitions,
          activeTuitions,
          totalApplicants,
          currentPlan: req.user.plan || "free",
        },
      });
    } catch (error) {
      console.error("Tutor Stats Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch tutor statistics",
      });
    }
  }
);

// 4. Tutor: Get applications for own tuition posts
router.get("/tutor", verifyToken, verifyTutor, async (req, res) => {
  try {
    const data = await applications()
      .find({ tutorId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      data,
      total: data.length,
    });
  } catch (error) {
    console.error("Fetch tutor applications error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch applicants",
    });
  }
});

// 5. Tutor: Accept or reject an application
router.patch("/:id/status", verifyToken, verifyTutor, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application ID",
      });
    }

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application status",
      });
    }

    const db = getDB();

    // Only an application that is still pending may be accepted or rejected.
    // Already accepted/rejected applications must never be treated as pending.
    const application = await db.collection("applications").findOne({
      _id: new ObjectId(id),
      status: "pending",
    });

    if (!application) {
      const exists = await db.collection("applications").findOne({
        _id: new ObjectId(id),
      });

      return res.status(exists ? 409 : 404).json({
        success: false,
        message: exists
          ? "Only pending applications can be accepted or rejected"
          : "Application does not exist",
      });
    }

    if (String(application.tutorId) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this application",
      });
    }

    // Ownership + pending status are both part of the filter, so an
    // unauthorized or concurrent request cannot modify the document.
    await db.collection("applications").updateOne(
      {
        _id: new ObjectId(id),
        tutorId: req.user.id,
        status: "pending",
      },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: `Application ${status} successfully`,
    });
  } catch (error) {
    console.error("Update application error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update application",
    });
  }
});

export default router;
