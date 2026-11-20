/**
 * Seeds realistic, connected tuition listings for the public Browse page.
 * Idempotent: running it again updates the same documents instead of creating
 * duplicates. Run with: npm run seed
 */
import "dotenv/config";
import { connectDB, getDB } from "../src/config/db.js";

const SUBJECTS = {
  mathematics: {
    subject: "Mathematics",
    banner: "/images/banners/math.svg",
  },
  physics: { subject: "Physics", banner: "/images/banners/physics.svg" },
  programming: {
    subject: "ICT",
    banner: "/images/banners/programming.svg",
  },
  english: { subject: "English", banner: "/images/banners/english.svg" },
};

const POSTS = [
  {
    key: "seed-01",
    subjectKey: "mathematics",
    title: "HSC Mathematics complete batch with exam drill",
    classLevel: "Class 11 - 12 (HSC)",
    mode: "online",
    location: "",
    monthlyFee: 3500,
    daysPerWeek: 4,
    description:
      "A complete HSC Mathematics course covering calculus, coordinates, vectors and statistics with weekly timed tests, step-by-step solutions and individual doubt clearing sessions.",
  },
  {
    key: "seed-02",
    subjectKey: "physics",
    title: "HSC Physics concept to problem solving batch",
    classLevel: "Class 11 - 12 (HSC)",
    mode: "online",
    location: "",
    monthlyFee: 3800,
    daysPerWeek: 3,
    description:
      "Build strong Physics fundamentals with guided derivations, chapter-wise practice problems, previous year questions and a focused revision plan before the board exam.",
  },
  {
    key: "seed-03",
    subjectKey: "programming",
    title: "Beginner to intermediate programming with Python",
    classLevel: "University",
    mode: "online",
    location: "",
    monthlyFee: 4500,
    daysPerWeek: 2,
    description:
      "Learn Python from the basics through hands-on projects, clean coding habits, data structures fundamentals and a final portfolio-ready mini project with mentor feedback.",
  },
  {
    key: "seed-04",
    subjectKey: "english",
    title: "IELTS preparation with speaking and writing feedback",
    classLevel: "Admission Preparation",
    mode: "online",
    location: "",
    monthlyFee: 4000,
    daysPerWeek: 3,
    description:
      "An intensive IELTS preparation course with vocabulary building, timed reading practice, mock speaking interviews and detailed band-scoring feedback on every writing task.",
  },
  {
    key: "seed-05",
    subjectKey: "mathematics",
    title: "SSC Mathematics foundation and board preparation",
    classLevel: "Class 9 - 10 (SSC)",
    mode: "offline",
    location: "Dhanmondi, Dhaka",
    monthlyFee: 3000,
    daysPerWeek: 3,
    description:
      "A focused SSC Mathematics batch that strengthens core concepts, solves textbook and board question patterns, and tracks every student with short weekly assessments.",
  },
  {
    key: "seed-06",
    subjectKey: "physics",
    title: "Class 9-10 Physics practical and theory support",
    classLevel: "Class 9 - 10 (SSC)",
    mode: "offline",
    location: "Uttara, Dhaka",
    monthlyFee: 2800,
    daysPerWeek: 2,
    description:
      "Small-group Physics classes combining theory explanation, practical notebooks and exam-oriented problem solving for students who want clear concepts and better grades.",
  },
  {
    key: "seed-07",
    subjectKey: "programming",
    title: "Web development bootcamp for university students",
    classLevel: "University",
    mode: "online",
    location: "",
    monthlyFee: 5500,
    daysPerWeek: 3,
    description:
      "A project-based web development mentorship covering HTML, CSS, JavaScript, React and Git. Each learner ships a deployed portfolio project and receives code reviews.",
  },
  {
    key: "seed-08",
    subjectKey: "english",
    title: "Spoken English confidence builder for beginners",
    classLevel: "Others",
    mode: "online",
    location: "",
    monthlyFee: 2200,
    daysPerWeek: 2,
    description:
      "Friendly small-group speaking practice with daily conversation prompts, pronunciation correction and practical vocabulary for students and young professionals.",
  },
  {
    key: "seed-09",
    subjectKey: "mathematics",
    title: "Class 6-8 Mathematics made easy weekly batch",
    classLevel: "Class 6 - 8",
    mode: "hybrid",
    location: "Mirpur, Dhaka",
    monthlyFee: 2500,
    daysPerWeek: 2,
    description:
      "An encouraging Mathematics class for middle-school learners with visual explanations, homework support, mental math drills and a monthly parent progress update.",
  },
  {
    key: "seed-10",
    subjectKey: "physics",
    title: "Admission test Physics crash course",
    classLevel: "Admission Preparation",
    mode: "online",
    location: "",
    monthlyFee: 5000,
    daysPerWeek: 5,
    description:
      "A focused crash course for university admission tests covering mechanics, electricity, optics and modern physics with daily timed MCQ practice and performance analysis.",
  },
  {
    key: "seed-11",
    subjectKey: "english",
    title: "HSC English grammar and composition improvement",
    classLevel: "Class 11 - 12 (HSC)",
    mode: "offline",
    location: "Gulshan, Dhaka",
    monthlyFee: 2600,
    daysPerWeek: 2,
    description:
      "Improve grammar, paragraph writing and letter/composition skills for the HSC exam with guided practice, model answers and individual correction after every class.",
  },
  {
    key: "seed-12",
    subjectKey: "programming",
    title: "1-on-1 ICT and coding mentorship for beginners",
    classLevel: "Class 9 - 10 (SSC)",
    mode: "online",
    location: "",
    monthlyFee: 3200,
    daysPerWeek: 1,
    description:
      "Personal one-on-one ICT mentorship for school students covering computer fundamentals, basic programming logic and guided practice tailored to each learner's pace.",
  },
];

const startServer = async () => {
  try {
    await connectDB();
    const db = getDB();
    const tutors = await db
      .collection("user")
      .find({ role: "tutor" }, { projection: { name: 1, email: 1 } })
      .toArray();

    if (tutors.length === 0) {
      throw new Error("No tutor accounts found. Create a tutor account first.");
    }

    let written = 0;

    for (let index = 0; index < POSTS.length; index += 1) {
      const post = POSTS[index];
      const subject = SUBJECTS[post.subjectKey];
      const tutor = tutors[index % tutors.length];
      const createdAt = new Date(Date.now() - index * 24 * 60 * 60 * 1000);

      const document = {
        title: post.title,
        subject: subject.subject,
        classLevel: post.classLevel,
        mode: post.mode,
        location: post.location,
        monthlyFee: post.monthlyFee,
        salary: post.monthlyFee,
        daysPerWeek: post.daysPerWeek,
        description: post.description,
        bannerImage: subject.banner,
        tutorId: String(tutor._id),
        tutorName: tutor.name,
        tutorEmail: tutor.email,
        approvalStatus: "approved",
        isActive: true,
        seedKey: post.key,
        createdAt,
      };

      await db.collection("tuitions").updateOne(
        { seedKey: post.key },
        { $set: document },
        { upsert: true }
      );
      written += 1;
    }

    console.log(`Seed complete: ${written} approved tuition listings ready.`);
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }
};

startServer();
