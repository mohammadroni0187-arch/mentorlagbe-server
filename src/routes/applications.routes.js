
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

    const newApplication = {
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

    const result = await applications().insertOne(newApplication);

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      data: {
        _id: result.insertedId,
        ...newApplication,
      },
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

      const [totalApplied, accepted, pending] = await Promise.all([
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
          totalApplied,
          accepted,
          pending,
          currentPlan: req.user.plan || "free",
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
