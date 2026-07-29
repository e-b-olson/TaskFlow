import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import pool from "../database";
import { generateToken } from "../middleware/auth";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ error: "username, email, and password are required" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  try {
    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1 OR email = $2",
      [username, email]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "Username or email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
      [username, email, passwordHash]
    );

    const userId = result.rows[0].id;
    const token = generateToken(userId);
    res.status(201).json({ token, userId, username });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  const { login, password } = req.body;

  if (!login || !password) {
    res.status(400).json({ error: "login and password are required" });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT id, username, password_hash FROM users WHERE username = $1 OR email = $1",
      [login]
    );

    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = generateToken(user.id);
    res.json({ token, userId: user.id, username: user.username });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
