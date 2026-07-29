import { test, expect } from "@playwright/test";
import { registerAndLogin, switchTab } from "./helpers";

test.describe("Navigation & UI", () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test("default tab is My Lists", async ({ page }) => {
    await expect(page.locator("#lists-tab")).toBeVisible();
    await expect(page.locator("#tasks-tab")).toBeHidden();
    await expect(page.locator("#smart-tab")).toBeHidden();
  });

  test("tab switching works correctly", async ({ page }) => {
    await switchTab(page, "All Tasks");
    await expect(page.locator("#tasks-tab")).toBeVisible();
    await expect(page.locator("#lists-tab")).toBeHidden();

    await switchTab(page, "Smart Builder");
    await expect(page.locator("#smart-tab")).toBeVisible();
    await expect(page.locator("#tasks-tab")).toBeHidden();

    await switchTab(page, "My Lists");
    await expect(page.locator("#lists-tab")).toBeVisible();
    await expect(page.locator("#smart-tab")).toBeHidden();
  });

  test("hamburger menu opens and closes", async ({ page }) => {
    const dropdown = page.locator("#hamburger-dropdown");
    await expect(dropdown).toBeHidden();

    await page.click(".hamburger-btn");
    await expect(dropdown).toBeVisible();

    // Close by clicking outside
    await page.click("header h1");
    await expect(dropdown).toBeHidden();
  });

  test("hamburger menu has correct items", async ({ page }) => {
    await page.click(".hamburger-btn");
    const dropdown = page.locator("#hamburger-dropdown");
    await expect(dropdown.locator('button:has-text("New List")')).toBeVisible();
    await expect(dropdown.locator('button:has-text("New Task")')).toBeVisible();
    await expect(dropdown.locator('button:has-text("Logout")')).toBeVisible();
  });

  test("task modal can be cancelled", async ({ page }) => {
    await page.click(".hamburger-btn");
    await page.click('button[role="menuitem"]:has-text("New Task")');
    await expect(page.locator("#task-modal")).toBeVisible();

    await page.click('#task-modal button:has-text("Cancel")');
    await expect(page.locator("#task-modal")).toBeHidden();
  });

  test("list modal can be cancelled", async ({ page }) => {
    await page.click(".hamburger-btn");
    await page.click('button[role="menuitem"]:has-text("New List")');
    await expect(page.locator("#list-modal")).toBeVisible();

    await page.click('.modal-actions-right button:has-text("Cancel")');
    await expect(page.locator("#list-modal")).toBeHidden();
  });
});
