import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import db from "../database";
import { generateToken } from "../middleware/auth";

const router = Router();

router.post("/register", (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ error: "username, email, and password are required" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(username, email);
  if (existing) {
    res.status(409).json({ error: "Username or email already exists" });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)").run(
    username,
    email,
    passwordHash
  );

  const token = generateToken(result.lastInsertRowid as number);
  res.status(201).json({ token, userId: result.lastInsertRowid, username });
});

router.post("/login", (req: Request, res: Response) => {
  const { login, password } = req.body;

  if (!login || !password) {
    res.status(400).json({ error: "login and password are required" });
    return;
  }

  const user = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ? OR email = ?").get(
    login,
    login
  ) as { id: number; username: string; password_hash: string } | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateToken(user.id);
  res.json({ token, userId: user.id, username: user.username });
});

export default router;
