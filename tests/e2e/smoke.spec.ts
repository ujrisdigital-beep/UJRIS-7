import { test, expect } from "@playwright/test";

test("landing page renders without executing attacker content", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: /something happened at work/i })).toBeVisible();
});

test("login page is reachable", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
});
