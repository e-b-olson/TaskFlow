import { Page, expect } from "@playwright/test";

/**
 * Generate a unique username/email for test isolation.
 */
export function uniqueUser() {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  return {
    username: `testuser_${id}`,
    email: `test_${id}@example.com`,
    password: "password123",
  };
}

/**
 * Register a new user and land on the main app screen.
 */
export async function registerAndLogin(page: Page) {
  const user = uniqueUser();

  await page.goto("/");
  await page.click('a:has-text("Register")');
  await page.fill("#reg-username", user.username);
  await page.fill("#reg-email", user.email);
  await page.fill("#reg-password", user.password);
  await page.click('#register-form button:has-text("Register")');

  // Wait for the main section to appear
  await expect(page.locator("#main-section")).toBeVisible();
  await expect(page.locator("#user-greeting")).toContainText(user.username);

  return user;
}

/**
 * Login with existing credentials.
 */
export async function login(page: Page, login: string, password: string) {
  await page.goto("/");
  await page.fill("#login-username", login);
  await page.fill("#login-password", password);
  await page.click('#login-form button:has-text("Login")');
  await expect(page.locator("#main-section")).toBeVisible();
}

/**
 * Create a task via the modal and return to the tasks list.
 */
export async function createTask(page: Page, title: string, options?: {
  priority?: string;
  effort?: string;
  timeEstimate?: string;
  description?: string;
}) {
  // Open hamburger menu and click "New Task"
  await page.click(".hamburger-btn");
  await page.click('button[role="menuitem"]:has-text("New Task")');

  await expect(page.locator("#task-modal")).toBeVisible();
  await page.fill("#task-title", title);

  if (options?.description) {
    await page.fill("#task-description", options.description);
  }
  if (options?.priority) {
    await page.selectOption("#task-priority", options.priority);
  }
  if (options?.effort) {
    await page.selectOption("#task-effort", options.effort);
  }
  if (options?.timeEstimate) {
    await page.fill("#task-estimate", options.timeEstimate);
  }

  await page.click('#task-modal button:has-text("Save")');
  await expect(page.locator("#task-modal")).toBeHidden();
}

/**
 * Switch to a specific tab.
 */
export async function switchTab(page: Page, tabName: "My Lists" | "All Tasks" | "Smart Builder") {
  await page.click(`.tab:has-text("${tabName}")`);
}
