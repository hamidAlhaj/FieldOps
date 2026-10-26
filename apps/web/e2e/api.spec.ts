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
  await page.goto("/administration");
  await expect(
    page.getByRole("heading", { name: "People & teams" }),
  ).toBeVisible();
  await page.getByLabel("New team name").fill("Browser operations team");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(page.getByLabel("Team name", { exact: true })).toHaveValue(
    "Browser operations team",
  );
  await page.screenshot({ animations: "disabled", timeout: 30000,
    path: "/tmp/fieldops-stage4-administration.png",
    fullPage: true,
  });
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Profile & settings", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Display name").fill("Updated Browser Manager");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue(
    "Updated Browser Manager",
  );
  await page.screenshot({ animations: "disabled", timeout: 30000,
    path: "/tmp/fieldops-stage4-profile.png",
    fullPage: true,
  });
  await page.goto("/analytics");
  await expect(
    page.getByRole("heading", { name: "Analytics & reports", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No completions in this period.")).toBeVisible();
  await page.screenshot({ animations: "disabled", timeout: 30000,
    path: "/tmp/fieldops-stage6-analytics.png",
    fullPage: true,
  });
  await page.goto("/audit-logs");
  await expect(
    page.getByRole("heading", { name: "Audit log", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No matching actions.")).toBeVisible();
  await page.screenshot({ animations: "disabled", timeout: 30000,
    path: "/tmp/fieldops-stage6-audit.png",
    fullPage: true,
  });
  await page.goto("/");
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

test("customer → dispatch → technician evidence → verification and closure with live updates", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const { PrismaClient } = await import("@prisma/client");
  const argon2 = await import("argon2");
  const { randomUUID } = await import("node:crypto");
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test"))
    throw new Error("Dedicated test database required");
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  const password = "Workflow-browser-test-only-2026!";
  const suffix = randomUUID();
  const org = await db.organization.create({
    data: { name: `Workflow browser ${suffix}` },
  });
  const people = [
    ["dispatcher", "DISPATCHER", "Maya Dispatch"],
    ["tech", "TECHNICIAN", "Omar Field"],
    ["customer", "CUSTOMER", "Community Clinic"],
  ] as const;
  try {
    for (const [key, name, displayName] of people) {
      const role = await db.role.upsert({
        where: { name },
        create: { name },
        update: {},
      });
      const user = await db.user.create({
        data: {
          email: `${key}-${suffix}@example.test`,
          displayName,
          passwordHash: await argon2.hash(password),
        },
      });
      const membership = await db.membership.create({
        data: { organizationId: org.id, userId: user.id, roleId: role.id },
      });
      if (name === "TECHNICIAN")
        await db.technicianProfile.create({
          data: {
            organizationId: org.id,
            membershipId: membership.id,
            employeeCode: "BROWSER-001",
          },
        });
      if (name === "CUSTOMER")
        await db.customerProfile.create({
          data: { organizationId: org.id, membershipId: membership.id },
        });
    }
  } finally {
    await db.$disconnect();
  }
  const customerContext = await browser.newContext();
  const dispatchContext = await browser.newContext();
  const technicianContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["geolocation"],
    geolocation: { latitude: 35.111111, longitude: 36.222222, accuracy: 14 },
  });
  try {
    const customer = await customerContext.newPage();
    const dispatch = await dispatchContext.newPage();
    const technician = await technicianContext.newPage();
    for (const [page, key] of [
      [customer, "customer"],
      [dispatch, "dispatcher"],
      [technician, "tech"],
    ] as const) {
      page.on("pageerror", (error) =>
        console.error("Browser error:", error.message),
      );
      page.on("response", (response) => {
        if (response.status() >= 400 && !response.url().includes("/refresh"))
          console.error("Request failed:", response.status(), response.url());
      });
      await page.goto("/login");
      await page.getByLabel("Work email").fill(`${key}-${suffix}@example.test`);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL("/");
    }
    await dispatch.getByRole("link", { name: "Request inbox" }).click();
    await customer
      .getByRole("link", { name: "My requests", exact: true })
      .click();
    await customer.getByRole("button", { name: "New request" }).click();
    await customer
      .getByLabel("Request title")
      .fill("Clinic cooling inspection");
    await customer
      .getByLabel("Service address")
      .fill("Clinic east wing, room 102");
    await customer
      .getByLabel("Describe the issue")
      .fill("The cooling unit vibrates and needs inspection.");
    await customer.getByRole("button", { name: "Submit request" }).click();
    await expect(
      customer.getByRole("heading", { name: "Clinic cooling inspection" }),
    ).toBeVisible();
    await dispatch
      .getByRole("button", { name: "Clinic cooling inspection" })
      .click();
    await dispatch
      .getByLabel("Review / cancellation notes")
      .fill("Confirmed access with clinic manager.");
    await dispatch.getByRole("button", { name: "Accept request" }).click();
    await dispatch.getByRole("button", { name: "Create work order" }).click();
    await expect(
      dispatch.getByRole("heading", { name: "Scope of work" }),
    ).toBeVisible();
    await dispatch
      .getByLabel("Technician", { exact: true })
      .selectOption({ label: "Omar Field · BROWSER-001" });
    await dispatch
      .getByRole("button", { name: "Assign technician", exact: true })
      .click();
    await technician
      .getByRole("button", { name: "Clinic cooling inspection" })
      .click();
    await technician.getByRole("button", { name: "Accept assignment" }).click();
    const sharp = (await import("sharp")).default;
    const buffer = await sharp({
      create: { width: 400, height: 300, channels: 3, background: "#21dda2" },
    })
      .png()
      .toBuffer();
    await technician
      .getByLabel("Image (JPEG, PNG or WebP · up to 5 MB)")
      .setInputFiles({ name: "before.png", mimeType: "image/png", buffer });
    await technician.getByRole("button", { name: "Upload photo" }).click();
    await expect(
      technician.getByRole("img", { name: "before maintenance evidence" }),
    ).toBeVisible();
    await technician.getByRole("button", { name: "Start work" }).click();
    // Stage 6A: real NestJS/PostgreSQL tracking with browser GPS permission.
    // No location request is permitted before the technician explicitly opts in.
    await expect(technician.getByRole("heading", { name: "Location sharing" })).toBeVisible();
    await expect(technician.getByRole("button", { name: "Start sharing location" })).toBeDisabled();
    const dispatcherWorkOrderUrl = dispatch.url();
    await dispatch.getByRole("link", { name: "Live tracking" }).click();
    await expect(dispatch.getByRole("heading", { name: "Live tracking" })).toBeVisible();
    await expect(dispatch.getByText("No technician has an active sharing session.")).toBeVisible();
    await technician.getByLabel("I agree to share my location during this work session").check();
    await technician.getByRole("button", { name: "Start sharing location" }).click();
    await expect(technician.getByText("Location sharing is on.")).toBeVisible({ timeout: 30_000 });
    await expect(dispatch.getByText("Omar Field", { exact: true })).toBeVisible({ timeout: 35_000 });
    await expect(dispatch.getByText("Recent", { exact: true })).toBeVisible({ timeout: 35_000 });
    await expect(dispatch.getByText("±14 m", { exact: true })).toBeVisible();

    // Server-side STOP removes the marker and last-known GPS fix.
    await technician.getByRole("button", { name: "Stop sharing location" }).click();
    await expect(technician.getByText("Sharing off", { exact: true })).toBeVisible();
    await expect(dispatch.getByText("No technician has an active sharing session."))
      .toBeVisible({ timeout: 35_000 });
    const customerRequestUrl = customer.url();
    await customer.goto("/tracking");
    await expect(customer).toHaveURL("/");
    await customer.goto(customerRequestUrl);
    await dispatch.goto(dispatcherWorkOrderUrl);
    await expect(dispatch.getByRole("heading", { name: "Scope of work" })).toBeVisible();

    await technician
      .getByLabel("Work notes / reason")
      .fill("Mounts replaced; completing final checks.");
    await technician.getByLabel("Progress (%)").fill("75");
    await technician
      .getByRole("button", { name: "Save progress update" })
      .click();
    await expect(
      dispatch.getByText("75%", { exact: true }).first(),
    ).toBeVisible();
    await technician.getByLabel("Photo stage").selectOption("AFTER");
    await technician
      .getByLabel("Image (JPEG, PNG or WebP · up to 5 MB)")
      .setInputFiles({ name: "after.png", mimeType: "image/png", buffer });
    await technician.getByRole("button", { name: "Upload photo" }).click();
    await expect(
      technician.getByRole("img", { name: "after maintenance evidence" }),
    ).toBeVisible();
    const accessibility = await new AxeBuilder({ page: technician })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(
      await technician.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await technician.locator("#main-content").focus();
    await technician.evaluate(() => window.scrollTo(0, 0));
    await technician.screenshot({ animations: "disabled", timeout: 30000,
      path: "/tmp/fieldops-stage5-technician.png",
      fullPage: true,
    });
    await technician
      .getByLabel("Work notes / reason")
      .fill("Tested under load. Cooling unit runs quietly.");
    await technician
      .getByRole("button", { name: "Complete work", exact: true })
      .click();
    await dispatch
      .getByRole("button", { name: "Verify completed work" })
      .click();
    await dispatch.getByRole("button", { name: "Close work order" }).click();
    await expect(dispatch.getByText(/^CLOSED · WO-/)).toBeVisible();
    await expect(customer.getByText("RESOLVED", { exact: true })).toBeVisible();
    await dispatch.locator("#main-content").focus();
    await dispatch.evaluate(() => window.scrollTo(0, 0));
    await dispatch.screenshot({ animations: "disabled", timeout: 30000,
      path: "/tmp/fieldops-stage5-dispatch.png",
      fullPage: true,
    });
    await technician
      .getByRole("button", { name: "Open notifications" })
      .click();
    await expect(
      technician.getByText("New assignment", { exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.allSettled([
      customerContext.close(),
      dispatchContext.close(),
      technicianContext.close(),
    ]);
  }
});
