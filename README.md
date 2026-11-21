# MentorLagbe (Server)

Express.js + MongoDB backend for the MentorLagbe Smart Tuition & Mentorship Platform.

## Project Overview

This API powers the MentorLagbe client. It provides BetterAuth authentication with JWT, role-based authorization, tuition CRUD and moderation, student applications, ImgBB image upload, Stripe Checkout subscriptions and platform statistics.

- **Client GitHub repository:** https://github.com/mohammadroni0187-arch/mentorlagbe-client.git
- **Server GitHub repository:** https://github.com/mohammadroni0187-arch/mentorlagbe-server.git
- **Live API:** https://mentorlagbe-server-jffj.vercel.app
- **Live client:** https://mentorlagbe-client-one.vercel.app
- **Local API URL:** `http://localhost:5000` (client at `http://localhost:3000`).

## Technology Stack

| Area | Technology |
| --- | --- |
| Runtime / framework | Node.js, Express.js 5 |
| Database | MongoDB (official `mongodb` driver, Atlas connection string) |
| Auth | BetterAuth with MongoDB adapter + JWT plugin |
| JWT verification | `jose` ( JWKS + issuer/audience checks ) and `jsonwebtoken` |
| Payments | Stripe Checkout (`stripe` SDK) |
| Media | ImgBB upload API |
| Config | `dotenv` |
| Tooling | `nodemon` |

## API Overview

| Prefix | Purpose |
| --- | --- |
| `/api/auth/*` | BetterAuth sign-up, sign-in, session and JWT token endpoints |
| `/api/tuitions` | Public list/search/filter, latest, tutor CRUD, active/closed toggle |
| `/api/applications` | Student apply/list/cancel; tutor list; accept/reject pending only |
| `/api/admin` | Stats, user role management, tuition approval, transactions |
| `/api/profile` | Profile read/update |
| `/api/profile/upload-image` | Protected ImgBB profile-image upload |
| `/api/payments` | Checkout session creation, verification, history, subscription |
| `/api/payments/webhook` | Stripe webhook (when `STRIPE_WEBHOOK_SECRET` is configured) |

## MongoDB Collections

| Collection | Created / updated by | Key fields |
| --- | --- | --- |
| `user` | BetterAuth, profile update, admin, Stripe sync | `_id`, `name`, `email`, `image`, `role`, `phone`, `bio`, `plan`, createdAt |
| `tuitions` | Tutors, admins | `_id`, `title`, `subject`, `classLevel`, `mode`, `location`, `monthlyFee`, `daysPerWeek`, `bannerImage`, `tutorId`, `tutorName`, `tutorEmail`, `approvalStatus`, `isActive`, `createdAt` |
| `applications` | Students, tutors | `_id`, `tuitionId`, `tuitionTitle`, `studentId`, `studentEmail`, `tutorId`, `tutorEmail`, `preferredSchedule`, `note`, `status`, `createdAt` |
| `payments` | Stripe webhook / verification | `_id`, `userId`, `userEmail`, `userName`, `userRole`, `planName`, `amount`, `currency`, `transactionId`, `stripeSessionId`, `paymentStatus`, `paidAt` |

Only approved and active tuitions are returned by the public list. Deleting a tuition also deletes its related applications. Only pending applications can be accepted or rejected, and only the owning tutor can change them.

## Authentication & Authorization

- BetterAuth is mounted with the MongoDB adapter; the JWT plugin adds `id`, `email`, `name`, `role` and `plan` to the token payload.
- `verifyToken` validates the Bearer JWT against the BetterAuth JWKS endpoint with matching issuer/audience.
- `verifyStudent`, `verifyTutor` and `verifyAdmin` enforce role restrictions on protected routes.
- New sign-ups are forced to `student` or `tutor` with `plan: "free"`. Admin role assignment is only possible through the admin-only endpoint.
- CORS accepts the configured `FRONTEND_URL` and `AUTH_BASE_URL` origins with credentials enabled.

## Stripe Payment Workflow

1. `POST /api/payments/create-plan-checkout-session` validates `audience` and `interval`, selects the configured price ID and creates a subscription Checkout Session.
2. Stripe redirects to the client `/payment/success?session_id=...` (or `/payment/cancel`).
3. `POST /api/payments/verify-checkout-session` retrieves the session from Stripe, checks that it belongs to the authenticated user, requires a completed subscription payment, sets `plan: "pro"` and upserts a single payment record keyed by Stripe session ID (prevents duplicates).
4. `POST /api/payments/webhook` performs the same sync for `checkout.session.completed` when the webhook secret is configured, and resets the plan to `free` on `customer.subscription.deleted`.
5. Tutor Pro: **$15/month**. Student Pro: **$10/month**. Yearly price IDs are configured through environment variables.

## ImgBB Image Upload Workflow

- `POST /api/profile/upload-image`: authenticated route; accepts a base64 image (data URL), validates size (max 5MB), strips the prefix, uploads the real file to `https://api.imgbb.com/1/upload`, stores `display_url` in the `user` document and returns the URL.
- Tutor banner uploads are performed from the client directly to ImgBB with `NEXT_PUBLIC_IMGBB_API_KEY`; the returned URL is saved in `tuitions.bannerImage` by the tuition create/update endpoints.

## Seed Data

`npm run seed` inserts 12 realistic, connected, approved and active tuition listings across multiple subjects. The script is idempotent (uses a `seedKey`) and links posts to existing tutor accounts.

## Environment Variables (names only — no secret values)

Create `.env` in this repository:

```bash
MONGO_URI=
DB_NAME=
PORT=
JWT_SECRET=
JWT_EXPIRES_IN=
AUTH_BASE_URL=
FRONTEND_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
GOOGLE_URI=
GOOGLE_SECRET=
IMGBB_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
STRIPE_TUTOR_MONTHLY_PRICE_ID=
STRIPE_TUTOR_YEARLY_PRICE_ID=
STRIPE_STUDENT_MONTHLY_PRICE_ID=
STRIPE_STUDENT_YEARLY_PRICE_ID=
```

`STRIPE_WEBHOOK_SECRET` is optional for local development: when it is empty, the webhook acknowledges delivery without syncing and the authenticated checkout-verification endpoint handles the sync instead. Configure it in production for reliable payment events.

## Installation

```bash
git clone https://github.com/mohammadroni0187-arch/mentorlagbe-server.git
cd mentorlagbe-server
npm install
cp .env.example .env  # or create .env with the names above
npm run dev
```

## Local Development Commands

```bash
npm run dev     # nodemon + src/index.js
npm start       # node src/index.js (production)
npm run seed    # seed 12 approved tuition listings
```

## Build & Deployment

This is a plain Node.js service; there is no build step. Deploy to any Node host (Render, Railway, VPS, etc.):

```bash
npm install --omit=dev
npm start
```

Set all environment variables in the hosting dashboard. For production, set `BETTER_AUTH_URL` and `AUTH_BASE_URL` to `https://mentorlagbe-server-jffj.vercel.app` and `FRONTEND_URL` to `https://mentorlagbe-client-one.vercel.app`, register the deployed Stripe webhook endpoint and set `STRIPE_WEBHOOK_SECRET`. Ensure MongoDB Atlas network access allows the deployment host.

## Testing Accounts

Accounts present in the database include (passwords are hashed and are **not** stored in this repository — reset them locally if needed):

- Admin: `admin2@gmail.com`
- Tutor: `ronihawlader0140622@gmail.com`
- Student: `mohammadroni0187@gmail.com`

No passwords are invented or published here.

## Important npm Packages

`express`, `cors`, `dotenv`, `mongodb`, `better-auth`, `jose`, `jsonwebtoken`, `stripe`, `nodemon`.