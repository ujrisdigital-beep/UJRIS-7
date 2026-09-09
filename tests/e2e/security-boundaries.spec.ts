import { expect, test } from "@playwright/test";

test("unauthenticated evidence download is denied over HTTP", async ({ request }) => {
  const res = await request.get("/api/evidence/not-a-real-id/file");
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error).toBe("Unauthorized");
});

test("login page does not disclose whether an email is registered", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("nobody-e2e@example.com");
  await page.getByLabel(/password/i).fill("wrong-password");
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await expect(page.getByText(/unable to sign you in/i)).toBeVisible({ timeout: 10_000 });
});
