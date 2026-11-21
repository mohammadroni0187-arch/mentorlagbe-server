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

## User Roles and Capabilities

### Student
- Browse, search and filter approved and active tuitions, view details, and apply once per tuition.
- Free plan: at most **2 applications in total (lifetime)**. Cancelling an application or a tutor rejecting one does **not** restore the quota. Pro plan: unlimited applications.
- View own application list and statistics (`GET /api/applications/student`, `GET /api/applications/student/stats`); cancel only own pending applications.
- Update profile/photo and upgrade to Student Pro through Stripe Checkout.

### Tutor
- Post tuitions (Free plan: up to 2 posts, Pro: unlimited), edit/delete own posts, toggle active/closed, and upload banners through ImgBB.
- Review applications on own tuitions; accept/reject only pending applications.
- View tutor statistics and applicant lists; update profile; upgrade to Tutor Pro and manage the subscription.

### Admin
- View platform statistics and the Stripe transaction overview.
- Change user roles (never your own) and approve/reject pending tuition posts.
- Admin does not create, cancel, accept or reject student applications.

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

This repository does **not** ship an `.env.example`. Create `.env` manually in the project root with the variable names below and fill in your own local values (never commit the file):

```bash
MONGODB_URI=
DB_NAME=
PORT=
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
NODE_ENV=
```

- `MONGODB_URI` — MongoDB Atlas connection string (the name used by `src/config/db.js`).
- `DB_NAME` — database name (defaults to `mentorlagbe`).
- `PORT` — local API port (defaults to `5000`).
- `AUTH_BASE_URL` / `FRONTEND_URL` — allowed browser origins for CORS and BetterAuth.
- `BETTER_AUTH_URL` — public server URL; also the JWT issuer/audience.
- `NODE_ENV` — normally set by the host; `production` enables Secure / `SameSite=None` auth cookies.
- Legacy notes about `JWT_SECRET` / `JWT_EXPIRES_IN` are obsolete: current tokens are verified through the BetterAuth JWKS endpoint using `BETTER_AUTH_URL`.

`STRIPE_WEBHOOK_SECRET` is optional for local development: when it is empty, the webhook acknowledges delivery without syncing and the authenticated checkout-verification endpoint handles the sync instead. Configure it in production for reliable payment events.

## Installation

```bash
git clone https://github.com/mohammadroni0187-arch/mentorlagbe-server.git
cd mentorlagbe-server
npm install
# Create .env manually with the variables listed in the Environment Variables section
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

### Admin demo login (safe)

- No demo password is published. Use an existing admin account (email above) with a password reset locally by the project owner, or sign up your own account and have an existing admin grant the role with `PATCH /api/admin/users/:id/role`.
- Sign in through the client at `/signIn` using that admin email and local password. The JWT issued by BetterAuth carries `role: admin`, which `verifyAdmin` checks on `/api/admin/*`.
- For a quick API smoke check, call `GET /api/admin/stats` with `Authorization: Bearer <token>` from `POST /api/auth/token`.
- Never commit passwords, tokens, or `.env` files.

## Important npm Packages

`express`, `cors`, `dotenv`, `mongodb`, `better-auth`, `jose`, `jsonwebtoken`, `stripe`, `nodemon`.