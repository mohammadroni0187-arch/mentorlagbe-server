
import express from "express";
import { getDB } from "../config/db.js";
import { ObjectId } from "mongodb";
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
// Admin Dashboard Statistics
router.get("/stats", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = getDB();

    // Better Auth-এর default MongoDB user collection
    const users = db.collection("user");
    const tuitions = db.collection("tuitions");
    const payments = db.collection("payments");

    const [
      totalUsers,
      totalTutors,
      pendingTuitions,
      approvedTuitions,
      revenueResult,
    ] = await Promise.all([
      users.countDocuments(),

      users.countDocuments({ role: "tutor" }),

      tuitions.countDocuments({ approvalStatus: "pending" }),

      tuitions.countDocuments({ approvalStatus: "approved" }),

      payments.aggregate([
        { $match: { paymentStatus: "paid" } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amount" },
          },
        },
      ]).toArray(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalTutors,
        pendingTuitions,
        approvedTuitions,
        totalRevenue: revenueResult[0]?.totalRevenue || 0,
      },
    });
  } catch (error) {
    console.error("Admin Stats Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin statistics",
    });
  }
});
// GET: All Users
router.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = getDB();

    const users = await db.collection("user")
      .find(
        {},
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
      )
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Get Users Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
});

// PATCH: Update User Role
router.patch(
  "/users/:id/role",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      const allowedRoles = ["student", "tutor", "admin"];

      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role",
        });
      }

      // Admin No Change Role
      if (id === req.user.id) {
        return res.status(400).json({
          success: false,
          message: "You cannot change your own role",
        });
      }

           if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message: "Invalid user ID",
            });
          }

          const usersCollection = getDB().collection("user");

          const existingUser = await usersCollection.findOne({
            _id: new ObjectId(id),
          });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const result = await usersCollection.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            role,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "User role updated successfully",
        data: {
          id,
          role,
        },
      });
    } catch (error) {
      console.error("Update User Role Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update user role",
      });
    }
  }
);

// GET: All Pending Tuitions
router.get("/tuitions/pending", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const data = await getDB()
      .collection("tuitions")
      .find({ approvalStatus: "pending" })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error) {
    console.error("Pending Tuitions Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch pending tuitions",
    });
  }
});

// PATCH: Approve or Reject Tuition
router.patch(
  "/tuitions/:id/status",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid tuition ID",
        });
      }

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be approved or rejected",
        });
      }

      const result = await getDB().collection("tuitions").updateOne(
        {
          _id: new ObjectId(id),
          approvalStatus: "pending",
        },
        {
          $set: {
            approvalStatus: status,
            isActive: status === "approved",
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

      return res.status(200).json({
        success: true,
        message: `Tuition ${status} successfully`,
      });
    } catch (error) {
      console.error("Tuition Approval Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update tuition status",
      });
    }
  }
);

// GET: All Stripe Transactions
router.get(
  "/transactions",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const db = getDB();

      const transactions = await db.collection("payments")
        .aggregate([
          {
            $sort: { createdAt: -1 },
          },
          {
            $addFields: {
              userObjectId: {
                $convert: {
                  input: "$userId",
                  to: "objectId",
                  onError: null,
                  onNull: null,
                },
              },
            },
          },
          {
            $lookup: {
              from: "user",
              localField: "userObjectId",
              foreignField: "_id",
              as: "userInfo",
            },
          },
          {
            $unwind: {
              path: "$userInfo",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              _id: 1,
              userName: { $ifNull: ["$userInfo.name", "Unknown User"] },
              userEmail: { $ifNull: ["$userInfo.email", "N/A"] },
              role: { $ifNull: ["$userInfo.role", "N/A"] },
              planName: { $literal: "Premium" },
              amount: 1,
              currency: 1,
              sessionId: 1,
              paymentStatus: 1,
              createdAt: 1,
            },
          },
        ])
        .toArray();

      return res.status(200).json({
        success: true,
        total: transactions.length,
        data: transactions,
      });
    } catch (error) {
      console.error("Admin Transactions Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch transactions",
      });
    }
  }
);

export default router;
