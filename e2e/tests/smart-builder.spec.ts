import { test, expect } from "@playwright/test";
import { registerAndLogin, createTask, switchTab } from "./helpers";

test.describe("Smart Builder", () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test("shows the smart builder form", async ({ page }) => {
    await switchTab(page, "Smart Builder");
    await expect(page.locator("#smart-tab")).toBeVisible();
    await expect(page.locator("#smart-minutes")).toBeVisible();
    await expect(page.locator('button:has-text("Generate List")')).toBeVisible();
  });

  test("shows no tasks message when user has none", async ({ page }) => {
    await switchTab(page, "Smart Builder");
    await page.fill("#smart-minutes", "60");
    await page.click('button:has-text("Generate List")');

    await expect(page.locator("#smart-results")).toBeVisible();
    await expect(page.locator("#smart-results")).toContainText("No matching tasks");
  });

  test("generates suggestions without creating a list", async ({ page }) => {
    await createTask(page, "Quick task", { timeEstimate: "15", priority: "HIGH" });
    await createTask(page, "Long task", { timeEstimate: "120", priority: "LOW" });

    await switchTab(page, "Smart Builder");
    await page.fill("#smart-minutes", "30");
    // Leave list name empty - should just suggest
    await page.fill("#smart-name", "");
    await page.click('button:has-text("Generate List")');

    await expect(page.locator("#smart-results")).toBeVisible();
    await expect(page.locator("#smart-results")).toContainText("Quick task");
    await expect(page.locator("#smart-results")).not.toContainText("Long task");
  });

  test("creates a list when name is provided", async ({ page }) => {
    await createTask(page, "Task A", { timeEstimate: "20", priority: "HIGH" });

    await switchTab(page, "Smart Builder");
    await page.fill("#smart-minutes", "60");
    await page.fill("#smart-name", "Auto List");
    await page.click('button:has-text("Generate List")');

    await expect(page.locator("#smart-results")).toBeVisible();
    await expect(page.locator("#smart-results")).toContainText("Auto List");
    await expect(page.locator("#smart-results")).toContainText("has been created");

    // Verify the list appears in the Lists tab
    await switchTab(page, "My Lists");
    await expect(page.locator("#lists-container")).toContainText("Auto List");
  });

  test("respects priority filter", async ({ page }) => {
    await createTask(page, "High priority", { timeEstimate: "15", priority: "HIGH" });
    await createTask(page, "Low priority", { timeEstimate: "15", priority: "LOW" });

    await switchTab(page, "Smart Builder");
    await page.fill("#smart-minutes", "60");
    await page.selectOption("#smart-priority", "LOW");
    await page.click('button:has-text("Generate List")');

    await expect(page.locator("#smart-results")).toContainText("Low priority");
    await expect(page.locator("#smart-results")).not.toContainText("High priority");
  });

  test("respects effort filter", async ({ page }) => {
    await createTask(page, "Easy task", { timeEstimate: "15", effort: "LOW" });
    await createTask(page, "Hard task", { timeEstimate: "15", effort: "HIGH" });

    await switchTab(page, "Smart Builder");
    await page.fill("#smart-minutes", "60");
    await page.selectOption("#smart-effort", "LOW");
    await page.click('button:has-text("Generate List")');

    await expect(page.locator("#smart-results")).toContainText("Easy task");
    await expect(page.locator("#smart-results")).not.toContainText("Hard task");
  });

  test("shows time summary in results", async ({ page }) => {
    await createTask(page, "Task 1", { timeEstimate: "20" });
    await createTask(page, "Task 2", { timeEstimate: "25" });

    await switchTab(page, "Smart Builder");
    await page.fill("#smart-minutes", "60");
    await page.click('button:has-text("Generate List")');

    await expect(page.locator("#smart-results")).toContainText("45 min planned");
    await expect(page.locator("#smart-results")).toContainText("15 min remaining");
  });

  test("validates available minutes", async ({ page }) => {
    await switchTab(page, "Smart Builder");
    await page.fill("#smart-minutes", "0");

    page.on("dialog", (dialog) => dialog.accept());
    await page.click('button:has-text("Generate List")');

    // Should show alert (we accepted it above)
    // The results section should not appear with valid data
  });
});
