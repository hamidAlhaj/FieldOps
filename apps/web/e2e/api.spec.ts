import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("real registration, session restoration, error recovery and logout against NestJS/PostgreSQL", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Browser Test Manager");
  await page.getByLabel("Organization name").fill("Browser Test Services");
  await page
    .getByLabel("Work email")
    .fill(`browser-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-test-password-only-2026!");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your operation, in focus." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A fresh start" }),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain(
    "accessToken",
  );
  await page.route("**/api/v1/organizations/*/work-orders", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "We couldn’t load your workspace." }),
  ).toBeVisible();
  await page.unroute("**/api/v1/organizations/*/work-orders");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "A fresh start" }),
  ).toBeVisible();
  const sibling = await page.context().newPage();
  await sibling.goto("/");
  await expect(
    sibling.getByRole("heading", { name: "Your operation, in focus." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(
    sibling.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await sibling.close();
  await page.goto("/work-orders");
  await expect(page).toHaveURL(/\/login$/);
});
