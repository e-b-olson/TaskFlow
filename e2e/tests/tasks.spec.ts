import { test, expect } from "@playwright/test";
import { registerAndLogin, createTask, switchTab } from "./helpers";

test.describe("Tasks", () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test("shows empty state when no tasks exist", async ({ page }) => {
    await switchTab(page, "All Tasks");
    await expect(page.locator("#tasks-list")).toContainText("No tasks found");
  });

  test("can create a task via the modal", async ({ page }) => {
    await createTask(page, "Buy groceries", {
      priority: "HIGH",
      effort: "LOW",
      timeEstimate: "30",
    });

    // Switch to tasks tab and verify
    await switchTab(page, "All Tasks");
    await expect(page.locator("#tasks-list")).toContainText("Buy groceries");
    await expect(page.locator("#tasks-list")).toContainText("HIGH");
  });

  test("can create a task with description", async ({ page }) => {
    await createTask(page, "Write report", {
      description: "Q3 quarterly report",
    });

    await switchTab(page, "All Tasks");
    await expect(page.locator("#tasks-list")).toContainText("Write report");
  });

  test("shows task detail when clicking a task card", async ({ page }) => {
    await createTask(page, "Detail test task", {
      priority: "HIGH",
      effort: "MEDIUM",
      timeEstimate: "45",
    });

    await switchTab(page, "All Tasks");
    await page.click('.task-card:has-text("Detail test task")');

    await expect(page.locator("#task-detail")).toBeVisible();
    await expect(page.locator("#task-detail-content")).toContainText("Detail test task");
    await expect(page.locator("#task-detail-content")).toContainText("HIGH");
    await expect(page.locator("#task-detail-content")).toContainText("45 min");
  });

  test("can edit a task from the detail view", async ({ page }) => {
    await createTask(page, "Task to edit");
    await switchTab(page, "All Tasks");
    await page.click('.task-card:has-text("Task to edit")');
    await page.click('button:has-text("Edit")');

    await expect(page.locator("#task-modal")).toBeVisible();
    await expect(page.locator("#task-modal-title")).toContainText("Edit Task");

    await page.fill("#task-title", "Edited task");
    await page.click('#task-modal button:has-text("Save")');

    await expect(page.locator("#task-modal")).toBeHidden();
    await expect(page.locator("#task-detail-content")).toContainText("Edited task");
  });

  test("can clone a task", async ({ page }) => {
    await createTask(page, "Original task");
    await switchTab(page, "All Tasks");
    await page.click('.task-card:has-text("Original task")');
    await page.click('button:has-text("Clone")');

    // Should return to task list with the clone
    await expect(page.locator("#tasks-list")).toContainText("Original task (copy)");
  });

  test("can delete a task", async ({ page }) => {
    await createTask(page, "Task to delete");
    await switchTab(page, "All Tasks");
    await page.click('.task-card:has-text("Task to delete")');

    page.on("dialog", (dialog) => dialog.accept());
    await page.click('#task-detail-content button:has-text("Delete")');

    await expect(page.locator("#tasks-list")).not.toContainText("Task to delete");
  });

  test("can filter tasks by status", async ({ page }) => {
    await createTask(page, "Pending task");

    await switchTab(page, "All Tasks");
    await page.selectOption("#filter-status", "IN_PROGRESS");

    // The pending task should not be visible
    await expect(page.locator("#tasks-list")).not.toContainText("Pending task");

    // Switch to PENDING and it should appear
    await page.selectOption("#filter-status", "PENDING");
    await expect(page.locator("#tasks-list")).toContainText("Pending task");
  });

  test("can filter tasks by priority", async ({ page }) => {
    await createTask(page, "High priority task", { priority: "HIGH" });
    await createTask(page, "Low priority task", { priority: "LOW" });

    await switchTab(page, "All Tasks");
    await page.selectOption("#filter-priority", "HIGH");

    await expect(page.locator("#tasks-list")).toContainText("High priority task");
    await expect(page.locator("#tasks-list")).not.toContainText("Low priority task");
  });

  test("can search tasks", async ({ page }) => {
    await createTask(page, "Buy milk");
    await createTask(page, "Clean house");

    await switchTab(page, "All Tasks");
    await page.fill("#search-input", "milk");

    // Wait for debounced search
    await page.waitForTimeout(400);
    await expect(page.locator("#tasks-list")).toContainText("Buy milk");
    await expect(page.locator("#tasks-list")).not.toContainText("Clean house");
  });

  test("back button returns from detail to list", async ({ page }) => {
    await createTask(page, "Navigation test");
    await switchTab(page, "All Tasks");
    await page.click('.task-card:has-text("Navigation test")');
    await expect(page.locator("#task-detail")).toBeVisible();

    await page.click('button:has-text("Back to Tasks")');
    await expect(page.locator("#task-detail")).toBeHidden();
    await expect(page.locator("#tasks-list")).toBeVisible();
  });
});
