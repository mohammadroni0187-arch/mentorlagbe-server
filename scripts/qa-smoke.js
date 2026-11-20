import "dotenv/config";
import { MongoClient } from "mongodb";

const BASE = "http://localhost:5000";
const stamp = Date.now();
const tutorEmail = `qa_tutor_${stamp}@example.test`;
const studentEmail = `qa_student_${stamp}@example.test`;
const password = `QaTest_${stamp}!`;

const client = new MongoClient(process.env.MONGO_URI);
await client.connect();
const db = client.db(process.env.DB_NAME || "mentorlagbe");

const cookieOf = (res) => {
  const raw = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie") || ""];
  return raw.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
};

const call = async (path, options = {}) => {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { Origin: "http://localhost:3000", ...(options.headers || {}) },
  });
  let body = {};
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body, headers: res.headers };
};

const authCall = (path, token, options = {}) =>
  call(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

const makeUser = async (name, email, role) => {
  const up = await call("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, role }),
  });
  const inRes = await call("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = cookieOf(inRes);
  const tokenRes = await call("/api/auth/token", {
    headers: { Cookie: cookie },
  });
  return {
    signup: up.status,
    signin: inRes.status,
    token: tokenRes.body?.token,
    cookie,
  };
};

try {
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetch(BASE + "/api/tuitions");
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  const tutor = await makeUser("QA Tutor", tutorEmail, "tutor");
  const student = await makeUser("QA Student", studentEmail, "student");

  console.log("AUTH", JSON.stringify({
    tutor: { signup: tutor.signup, signin: tutor.signin, token: !!tutor.token },
    student: { signup: student.signup, signin: student.signin, token: !!student.token },
  }));

  if (!tutor.token || !student.token) throw new Error("Could not obtain QA tokens");

  // Role restrictions
  console.log("ROLE student->post tuitions", (await authCall("/api/tuitions", student.token, {
    method: "POST",
    body: JSON.stringify({}),
  })).status);

  // Tutor creates a tuition
  const created = await authCall("/api/tuitions", tutor.token, {
    method: "POST",
    body: JSON.stringify({
      title: "QA smoke test tuition batch",
      subject: "Mathematics",
      classLevel: "Class 6 - 8",
      mode: "online",
      location: "",
      monthlyFee: 2000,
      daysPerWeek: 2,
      description: "A temporary QA smoke test tuition created to verify backend CRUD behaviour.",
    }),
  });
  const tuitionId = created.body?.data?._id;
  console.log("TUTOR create", created.status, "id:", tuitionId, "isActive:", created.body?.data?.isActive);

  const mine = await authCall("/api/tuitions/my", tutor.token);
  console.log("TUTOR my count", mine.status, mine.body?.total);

  // Approve the QA tuition directly in DB so a student can apply through the real API.
  await db.collection("tuitions").updateOne(
    { _id: new (await import("mongodb")).ObjectId(tuitionId) },
    { $set: { approvalStatus: "approved", isActive: true } }
  );

  // Student applies, then duplicate is rejected
  const applyBody = {
    tuitionId,
    preferredSchedule: "Saturday 5 PM",
    phone: "01712345678",
    note: "QA smoke test application",
  };
  const apply1 = await authCall("/api/applications", student.token, {
    method: "POST",
    body: JSON.stringify(applyBody),
  });
  const apply2 = await authCall("/api/applications", student.token, {
    method: "POST",
    body: JSON.stringify(applyBody),
  });
  const applicationId = apply1.body?.data?._id;
  console.log("STUDENT apply", apply1.status, "duplicate", apply2.status);

  // Tutor accepts, then a second update must be rejected (pending-only rule)
  const accept1 = await authCall(`/api/applications/${applicationId}/status`, tutor.token, {
    method: "PATCH",
    body: JSON.stringify({ status: "accepted" }),
  });
  const accept2 = await authCall(`/api/applications/${applicationId}/status`, tutor.token, {
    method: "PATCH",
    body: JSON.stringify({ status: "rejected" }),
  });
  console.log("TUTOR accept", accept1.status, "second update", accept2.status);

  // Student cannot cancel an accepted application
  const cancel = await authCall(`/api/applications/${applicationId}`, student.token, {
    method: "DELETE",
  });
  console.log("STUDENT cancel accepted", cancel.status);

  // Student cannot accept applications
  const studentPatch = await authCall(`/api/applications/${applicationId}/status`, student.token, {
    method: "PATCH",
    body: JSON.stringify({ status: "accepted" }),
  });
  console.log("STUDENT patch status", studentPatch.status);

  // Stripe checkout session creation (does not charge anything)
  const checkout = await authCall("/api/payments/create-plan-checkout-session", tutor.token, {
    method: "POST",
    body: JSON.stringify({ audience: "tutor", interval: "monthly" }),
  });
  console.log("STRIPE checkout", checkout.status, "url:", checkout.body?.url?.startsWith("https://checkout.stripe.com") ? "valid-stripe-url" : String(checkout.body?.message));

  // Verification guards: another user cannot verify, unpaid session is rejected.
  const verifyForeign = await authCall("/api/payments/verify-checkout-session", student.token, {
    method: "POST",
    body: JSON.stringify({ sessionId: checkout.body?.sessionId }),
  });
  console.log("STRIPE verify foreign", verifyForeign.status);

  const verifyUnpaid = await authCall("/api/payments/verify-checkout-session", tutor.token, {
    method: "POST",
    body: JSON.stringify({ sessionId: checkout.body?.sessionId }),
  });
  console.log("STRIPE verify unpaid", verifyUnpaid.status, verifyUnpaid.body?.message);

  // ImgBB upload through the protected server route (tiny valid PNG)
  const pngBase64 =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nYkAAAAASUVORK5CYII=";
  const upload = await authCall("/api/profile/upload-image", tutor.token, {
    method: "POST",
    body: JSON.stringify({ image: pngBase64 }),
  });
  console.log("IMGBB upload", upload.status, "url:", upload.body?.data?.image?.startsWith("https://") ? "valid-url" : JSON.stringify(upload.body));

  // Delete tuition and verify related applications were removed
  const del = await authCall(`/api/tuitions/${tuitionId}`, tutor.token, { method: "DELETE" });
  const { ObjectId } = await import("mongodb");
  const orphanApps = await db.collection("applications").countDocuments({
    tuitionId: { $in: [new ObjectId(tuitionId), tuitionId] },
  });
  console.log("TUTOR delete", del.status, "related applications left:", orphanApps);
} catch (error) {
  console.error("QA smoke failed:", error);
} finally {
  // Cleanup only QA-created data
  const { ObjectId } = await import("mongodb");
  const qaUsers = await db.collection("user").find({
    email: { $in: [tutorEmail, studentEmail] },
  }, { projection: { _id: 1 } }).toArray();
  const qaIds = qaUsers.map((u) => String(u._id));
  await db.collection("user").deleteMany({ _id: { $in: qaUsers.map((u) => u._id) } });
  await db.collection("tuitions").deleteMany({ tutorId: { $in: qaIds } });
  await db.collection("applications").deleteMany({
    $or: [{ studentId: { $in: qaIds } }, { tutorId: { $in: qaIds } }],
  });
  await db.collection("payments").deleteMany({ userId: { $in: qaIds } });
  console.log("QA cleanup done");
  await client.close();
}
