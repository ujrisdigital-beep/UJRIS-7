import { db } from "@/lib/db";
import { hashPassword, issueSession, SESSION_COOKIE } from "@/lib/auth";
import { setTestCookie } from "./next-runtime";

export async function seedUser(email = `user-${crypto.randomUUID()}@example.com`) {
  return db.user.create({
    data: {
      email,
      name: "Test User",
      passwordHash: await hashPassword("password12"),
      plan: "free",
    },
  });
}

export async function seedCase(userId: string) {
  return db.case.create({
    data: {
      userId,
      title: "Test case",
      situation: "dismissal",
      narrative: "I was dismissed after raising a complaint about discrimination at work last month.",
      urgency: "low",
      readiness: 10,
    },
  });
}

export async function loginAs(user: { id: string; email: string; name: string; role: string }) {
  const { token } = await issueSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  setTestCookie(SESSION_COOKIE, token);
  return token;
}
