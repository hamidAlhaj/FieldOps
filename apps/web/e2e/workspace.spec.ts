import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function enter(
  page: import("@playwright/test").Page,
  role = "DISPATCHER",
) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Meet your new command center." }),
  ).toBeVisible();
  await page.getByLabel("Explore as").selectOption(role);
  await page.getByRole("button", { name: "Explore workspace" }).click();
  await expect(page.getByRole("table")).toBeVisible();
}
test("demo navigation, search, filters, pagination, details and theme", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("link", { name: "View work orders" }).click();
  await expect(
    page.getByRole("heading", { name: "Work, well organized." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("9–12 of 12 work orders")).toBeVisible();
  await page.getByRole("textbox", { name: "Search work orders" }).fill("HVAC");
  await expect(page.getByText("1–1 of 1 work orders")).toBeVisible();
  await page.getByRole("button", { name: "HVAC system inspection" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("textbox", { name: "Search work orders" })
    .fill("unmatchable");
  await expect(
    page.getByRole("heading", { name: "No matching results" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Filter by status").selectOption("IN_PROGRESS");
  await expect(page.getByText("1–2 of 2 work orders")).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
test("role switching scopes data and customer routes", async ({ page }) => {
  await enter(page, "TECHNICIAN");
  await expect(page.getByText("1–3 of 3 work orders")).toBeVisible();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Customer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your spaces. Taken care of." }),
  ).toBeVisible();
  await expect(page.getByText("1–4 of 4 requests")).toBeVisible();
  await page.goto("/work-orders");
  await expect(page).toHaveURL(/\/login$/);
});
test("mobile navigation, touch target layout and details", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Work orders", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Work, well organized." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/fieldops-mobile.png", fullPage: true });
});
test("overview meets automated accessibility checks in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await enter(page);
  await page.screenshot({ path: "/tmp/fieldops-desktop.png", fullPage: true });
  let result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: "/tmp/fieldops-dark.png", fullPage: true });
});
test("demo entry screen is keyboard accessible", async ({ page }) => {
  await page.goto("/login");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.getByRole("button", { name: "Explore workspace" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("table")).toBeVisible();
});
test("tablet layouts keep content within the viewport", async ({ page }) => {
  await enter(page);
  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 1024 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByRole("table")).toBeVisible();
  }
});
