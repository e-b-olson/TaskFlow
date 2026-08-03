import { test, expect } from "@playwright/test";
import { registerAndLogin, createTask, switchTab } from "./helpers";

test.describe("Lists", () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test("shows empty state when no lists exist", async ({ page }) => {
    await expect(page.locator("#lists-container")).toContainText("No lists yet");
  });

  test("can create a new list", async ({ page }) => {
    await page.click(".hamburger-btn");
    await page.click('button[role="menuitem"]:has-text("New List")');

    await expect(page.locator("#list-modal")).toBeVisible();
    await page.fill("#list-name", "Shopping List");
    await page.fill("#list-description", "Weekly groceries");
    await page.click('#list-modal button:has-text("Create")');

    await expect(page.locator("#list-modal")).toBeHidden();
    await expect(page.locator("#lists-container")).toContainText("Shopping List");
  });

  test("can create a list with tasks selected", async ({ page }) => {
    // Create a task first
    await createTask(page, "Task for list");

    // Create a list and select the task
    await page.click(".hamburger-btn");
    await page.click('button[role="menuitem"]:has-text("New List")');
    await page.fill("#list-name", "List with tasks");

    // The task selector should show the task
    await expect(page.locator("#list-task-selector")).toContainText("Task for list");
    await page.check('input[type="checkbox"]');

    await page.click('#list-modal button:has-text("Create")');
    await expect(page.locator("#list-modal")).toBeHidden();

    // View the list to verify the task is in it
    await page.click('.list-card:has-text("List with tasks")');
    await expect(page.locator("#list-detail-content")).toContainText("Task for list");
  });

  test("can view a list's tasks", async ({ page }) => {
    await createTask(page, "List task 1");
    await createTask(page, "List task 2");

    // Create list with both tasks
    await page.click(".hamburger-btn");
    await page.click('button[role="menuitem"]:has-text("New List")');
    await page.fill("#list-name", "My List");

    const checkboxes = page.locator('#list-task-selector input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }

    await page.click('#list-modal button:has-text("Create")');

    // View the list
    await page.click('.list-card:has-text("My List")');
    await expect(page.locator("#list-detail-content")).toContainText("List task 1");
    await expect(page.locator("#list-detail-content")).toContainText("List task 2");
  });

  test("can edit a list name", async ({ page }) => {
    // Create a list
    await page.click(".hamburger-btn");
    await page.click('button[role="menuitem"]:has-text("New List")');
    await page.fill("#list-name", "Original Name");
    await page.click('#list-modal button:has-text("Create")');

    // View and edit
    await page.click('.list-card:has-text("Original Name")');
    await page.click('button[aria-label="Edit list"]');

    await expect(page.locator("#list-modal")).toBeVisible();
    await expect(page.locator("#list-modal-title")).toContainText("Edit List");

    await page.fill("#list-name", "Updated Name");
    await page.click('#list-modal button:has-text("Save Changes")');

    await expect(page.locator("#list-detail-content")).toContainText("Updated Name");
  });

  test("can delete a list from the edit modal", async ({ page }) => {
    // Create a list
    await page.click(".hamburger-btn");
    await page.click('button[role="menuitem"]:has-text("New List")');
    await page.fill("#list-name", "To Delete");
    await page.click('#list-modal button:has-text("Create")');

    // View and open edit modal
    await page.click('.list-card:has-text("To Delete")');
    await page.click('button[aria-label="Edit list"]');

    // Delete from modal
    page.on("dialog", (dialog) => dialog.accept());
    await page.click('#list-delete-btn');

    await expect(page.locator("#list-modal")).toBeHidden();
    await expect(page.locator("#lists-container")).not.toContainText("To Delete");
  });

  test("can start and complete tasks within a list", async ({ page }) => {
    // Create task and list
    await createTask(page, "Workflow task");

    await page.click(".hamburger-btn");
    await page.click('button[role="menuitem"]:has-text("New List")');
    await page.fill("#list-name", "Workflow List");
    await page.check('#list-task-selector input[type="checkbox"]');
    await page.click('#list-modal button:has-text("Create")');

    // View list
    await page.click('.list-card:has-text("Workflow List")');
    await expect(page.locator('#list-detail-content button:has-text("Start")')).toBeVisible();

    // Start the task
    await page.click('button:has-text("Start")');
    await expect(page.locator("#list-detail-content")).toContainText("IN PROGRESS");

    // Complete the task
    await page.click('button:has-text("Complete")');
    await expect(page.locator("#list-detail-content")).toContainText("COMPLETE");
  });

  test("back button returns to lists view", async ({ page }) => {
    await page.click(".hamburger-btn");
    await page.click('button[role="menuitem"]:has-text("New List")');
    await page.fill("#list-name", "Nav Test");
    await page.click('#list-modal button:has-text("Create")');

    await page.click('.list-card:has-text("Nav Test")');
    await expect(page.locator("#list-detail")).toBeVisible();

    await page.click('button:has-text("Back to Lists")');
    await expect(page.locator("#list-detail")).toBeHidden();
    await expect(page.locator("#lists-container")).toBeVisible();
  });

  test("inline task creation from list modal", async ({ page }) => {
    await page.click(".hamburger-btn");
    await page.click('button[role="menuitem"]:has-text("New List")');
    await page.fill("#list-name", "Inline task list");

    // Use the inline task form
    await page.click('button:has-text("+ New Task")');
    await expect(page.locator("#inline-task-form")).toBeVisible();

    await page.fill("#inline-task-title", "New inline task");
    await page.click('#inline-task-form button:has-text("Add Task")');

    // The new task should appear checked in the selector
    await expect(page.locator("#list-task-selector")).toContainText("New inline task");

    await page.click('#list-modal button:has-text("Create")');

    // Verify task is in the list
    await page.click('.list-card:has-text("Inline task list")');
    await expect(page.locator("#list-detail-content")).toContainText("New inline task");
  });
});
