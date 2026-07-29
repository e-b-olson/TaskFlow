import { test, expect } from "@playwright/test";
import { uniqueUser, registerAndLogin, login } from "./helpers";

test.describe("Authentication", () => {
  test("shows login form by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#auth-section")).toBeVisible();
    await expect(page.locator("#login-form")).toBeVisible();
    await expect(page.locator("#register-form")).toBeHidden();
  });

  test("can switch to register form and back", async ({ page }) => {
    await page.goto("/");
    await page.click('a:has-text("Register")');
    await expect(page.locator("#register-form")).toBeVisible();
    await expect(page.locator("#login-form")).toBeHidden();

    await page.click('a:has-text("Login")');
    await expect(page.locator("#login-form")).toBeVisible();
    await expect(page.locator("#register-form")).toBeHidden();
  });

  test("successful registration enters the app", async ({ page }) => {
    const user = await registerAndLogin(page);
    await expect(page.locator("#main-section")).toBeVisible();
    await expect(page.locator("#auth-section")).toBeHidden();
    await expect(page.locator("#user-greeting")).toContainText(user.username);
  });

  test("registration shows error for duplicate username", async ({ page }) => {
    const user = uniqueUser();

    // Register first time
    await page.goto("/");
    await page.click('a:has-text("Register")');
    await page.fill("#reg-username", user.username);
    await page.fill("#reg-email", user.email);
    await page.fill("#reg-password", user.password);
    await page.click('#register-form button:has-text("Register")');
    await expect(page.locator("#main-section")).toBeVisible();

    // Logout and try to register with same username
    await page.click(".hamburger-btn");
    await page.click('button:has-text("Logout")');
    await expect(page.locator("#auth-section")).toBeVisible();

    // Navigate fresh to reset form state
    await page.goto("/");
    await page.click('a:has-text("Register")');
    await page.fill("#reg-username", user.username);
    await page.fill("#reg-email", "different@example.com");
    await page.fill("#reg-password", user.password);
    await page.click('#register-form button:has-text("Register")');

    await expect(page.locator("#auth-error")).toBeVisible();
    await expect(page.locator("#auth-error")).toContainText("already exists");
  });

  test("registration shows error for empty fields", async ({ page }) => {
    await page.goto("/");
    await page.click('a:has-text("Register")');
    await page.click('#register-form button:has-text("Register")');
    await expect(page.locator("#auth-error")).toBeVisible();
    await expect(page.locator("#auth-error")).toContainText("fill in all fields");
  });

  test("successful login with username", async ({ page }) => {
    const user = uniqueUser();

    // Register first
    await page.goto("/");
    await page.click('a:has-text("Register")');
    await page.fill("#reg-username", user.username);
    await page.fill("#reg-email", user.email);
    await page.fill("#reg-password", user.password);
    await page.click('#register-form button:has-text("Register")');
    await expect(page.locator("#main-section")).toBeVisible();

    // Logout
    await page.click(".hamburger-btn");
    await page.click('button:has-text("Logout")');
    await expect(page.locator("#auth-section")).toBeVisible();

    // Login
    await login(page, user.username, user.password);
    await expect(page.locator("#user-greeting")).toContainText(user.username);
  });

  test("login shows error for invalid credentials", async ({ page }) => {
    await page.goto("/");
    await page.fill("#login-username", "nonexistent");
    await page.fill("#login-password", "wrongpass");
    await page.click('#login-form button:has-text("Login")');
    await expect(page.locator("#auth-error")).toBeVisible();
  });

  test("login shows error for empty fields", async ({ page }) => {
    await page.goto("/");
    await page.click('#login-form button:has-text("Login")');
    await expect(page.locator("#auth-error")).toBeVisible();
    await expect(page.locator("#auth-error")).toContainText("fill in all fields");
  });

  test("logout returns to auth screen", async ({ page }) => {
    await registerAndLogin(page);
    await page.click(".hamburger-btn");
    await page.click('button:has-text("Logout")');
    await expect(page.locator("#auth-section")).toBeVisible();
    await expect(page.locator("#main-section")).toBeHidden();
  });

  test("session persists on page reload", async ({ page }) => {
    const user = await registerAndLogin(page);
    await page.reload();
    await expect(page.locator("#main-section")).toBeVisible();
    await expect(page.locator("#user-greeting")).toContainText(user.username);
  });
});
