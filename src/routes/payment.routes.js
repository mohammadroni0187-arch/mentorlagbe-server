import express from "express";
import Stripe from "stripe";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyToken, verifyTutor } from "../middlewares/verifyToken.js";


const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Tutor Premium Subscription Checkout
router.post(
  "/create-checkout-session",
  verifyToken,
  verifyTutor,
  async (req, res) => {
    try {
      if (!ObjectId.isValid(req.user.id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        client_reference_id: req.user.id,
        metadata: {
          userId: req.user.id,
          plan: "premium",
        },
        subscription_data: {
          metadata: {
            userId: req.user.id,
            plan: "premium",
          },
        },
        success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      });

      res.status(200).json({
        success: true,
        url: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      console.error("Checkout error:", error);
      res.status(500).json({ message: "Payment session creation failed" });
    }
  }
);

/* Tutor and Student Monthly / Yearly Checkout */
router.post(
  "/create-plan-checkout-session",
  verifyToken,
  async (req, res) => {
    try {
      const { audience, interval } = req.body;

      // Only student and tutor can subscribe
      if (!["student", "tutor"].includes(audience)) {
        return res.status(400).json({
          success: false,
          message: "Invalid account type",
        });
      }

      // User can only purchase their own account plan
      if (req.user.role !== audience) {
        return res.status(403).json({
          success: false,
          message: "You cannot purchase this plan",
        });
      }

      if (!["monthly", "yearly"].includes(interval)) {
        return res.status(400).json({
          success: false,
          message: "Invalid billing interval",
        });
      }

      if (!ObjectId.isValid(req.user.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      const priceIds = {
        tutor: {
          monthly:
            process.env.STRIPE_TUTOR_MONTHLY_PRICE_ID ||
            process.env.STRIPE_PRICE_ID,
          yearly: process.env.STRIPE_TUTOR_YEARLY_PRICE_ID,
        },
        student: {
          monthly: process.env.STRIPE_STUDENT_MONTHLY_PRICE_ID,
          yearly: process.env.STRIPE_STUDENT_YEARLY_PRICE_ID,
        },
      };

      const priceId = priceIds[audience][interval];

      if (!priceId) {
        return res.status(503).json({
          success: false,
          message: `${audience} ${interval} price is not configured`,
        });
      }

      const db = getDB();

      const user = await db.collection("user").findOne(
        { _id: new ObjectId(req.user.id) },
        { projection: { name: 1, email: 1, plan: 1 } }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const planName = `${audience}_${interval}_pro`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        client_reference_id: req.user.id,
        customer_email: user.email,
        metadata: {
          userId: req.user.id,
          audience,
          interval,
          plan: "premium",
          planName,
        },
        subscription_data: {
          metadata: {
            userId: req.user.id,
            audience,
            interval,
            plan: "premium",
            planName,
          },
        },
        success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      });

      return res.status(200).json({
        success: true,
        url: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      console.error("Plan Checkout Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create checkout session",
      });
    }
  }
);


// Payment History
router.get("/history", verifyToken, async (req, res) => {
  try {
    const db = getDB();

    const payments = await db
      .collection("payments")
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ message: "Failed to load payment history" });
  }
});

/**
 * Shared DB sync used by BOTH the Stripe webhook and the checkout-verification
 * fallback (needed when STRIPE_WEBHOOK_SECRET is not configured yet).
 * Keeps legacy field names so the existing admin/payment pages keep working.
 */
const activateProAndRecordPayment = async (db, session) => {
  const userId = session.metadata?.userId || session.client_reference_id;

  if (session.mode !== "subscription" || !ObjectId.isValid(userId)) {
    return false;
  }

  const user = await db.collection("user").findOne(
    { _id: new ObjectId(userId) },
    { projection: { name: 1, email: 1, role: 1 } }
  );

  // Requirement: the subscription plan field is 'pro'.
  await db.collection("user").updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        plan: "pro",
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        updatedAt: new Date(),
      },
    }
  );

  const role = session.metadata?.audience || user?.role || "N/A";
  const now = new Date();

  await db.collection("payments").updateOne(
    {
      $or: [{ sessionId: session.id }, { stripeSessionId: session.id }],
    },
    {
      $set: {
        userId,
        userEmail: user?.email || session.customer_email || "N/A",
        userName: user?.name || "Unknown",
        userRole: role,
        planName: session.metadata?.planName || "Pro",
        amount: (session.amount_total || 0) / 100,
        currency: session.currency || "usd",
        transactionId:
          (typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id) ||
          session.subscription ||
          session.id,
        stripeSessionId: session.id,
        paymentStatus: "paid",
        paidAt: now,
        // legacy aliases (unchanged consumers)
        sessionId: session.id,
        role,
        customerId: session.customer,
        subscriptionId: session.subscription,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return true;
};

/**
 * POST /api/payments/verify-checkout-session { sessionId }
 * Called by /payment/success. Confirms the session with Stripe, checks that it
 * belongs to the logged-in user, then syncs plan + payment record.
 */
router.post("/verify-checkout-session", verifyToken, async (req, res) => {
  try {
    const sessionId =
      typeof req.body?.sessionId === "string"
        ? req.body.sessionId.trim()
        : typeof req.body?.session_id === "string"
          ? req.body.session_id.trim()
          : "";

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Checkout session ID is required",
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionUserId = session.metadata?.userId || session.client_reference_id;

    if (!sessionUserId || String(sessionUserId) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "This payment does not belong to your account",
      });
    }

    if (
      session.mode !== "subscription" ||
      !["paid", "no_payment_required"].includes(session.payment_status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment has not been completed",
      });
    }

    await activateProAndRecordPayment(getDB(), session);

    return res.status(200).json({
      success: true,
      message: "Payment verified. Your Pro plan is active.",
      plan: "pro",
    });
  } catch (error) {
    console.error("Checkout verification error:", error);
    return res.status(400).json({
      success: false,
      message: "Could not verify this checkout session",
    });
  }
});

// Stripe Webhook Handler
export const stripeWebhookHandler = async (req, res) => {
  // When the webhook secret is not configured we acknowledge delivery and rely
  // on the authenticated checkout-verification endpoint above instead.
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn(
      "STRIPE_WEBHOOK_SECRET is not set - using checkout verification fallback."
    );
    return res
      .status(200)
      .json({ received: false, webhookConfigured: false });
  }

  const signature = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    const db = getDB();

    if (event.type === "checkout.session.completed") {
      await activateProAndRecordPayment(db, event.data.object);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;

      await db.collection("user").updateOne(
        { stripeSubscriptionId: subscription.id },
        {
          $set: {
            plan: "free",
            updatedAt: new Date(),
          },
          $unset: {
            stripeSubscriptionId: "",
          },
        }
      );
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({ message: "Webhook processing failed" });
  }
};

// Get Tutor Subscription Details
router.get("/subscription", verifyToken, verifyTutor, async (req, res) => {
  try {
    const db = getDB();

    const user = await db.collection("user").findOne(
      { _id: new ObjectId(req.user.id) },
      { projection: { plan: 1, stripeSubscriptionId: 1 } }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let subscription = null;

    if (user.stripeSubscriptionId) {
      subscription = await stripe.subscriptions.retrieve(
        user.stripeSubscriptionId
      );
    }

    res.status(200).json({
      success: true,
      plan: user.plan || "free",
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            currentPeriodEnd: subscription.current_period_end,
          }
        : null,
    });
  } catch (error) {
    console.error("Subscription error:", error);
    res.status(500).json({ message: "Failed to load subscription" });
  }
});

// Cancel Tutor Subscription
router.post("/cancel-subscription", verifyToken, verifyTutor, async (req, res) => {
  try {
    const db = getDB();

    const user = await db.collection("user").findOne({
      _id: new ObjectId(req.user.id),
    });

    if (!user?.stripeSubscriptionId) {
      return res.status(404).json({
        message: "No active subscription found",
      });
    }

    const subscription = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    res.status(200).json({
      success: true,
      message: "Subscription will cancel at the end of billing period",
      subscription,
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json({ message: "Failed to cancel subscription" });
  }
});

export default router;