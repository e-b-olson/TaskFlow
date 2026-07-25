import { Router, Response } from "express";
import db from "../database";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// Get all tasks for the user with optional sort and filter
router.get("/", (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const {
    status,
    priority,
    effort,
    sort_by = "created_at",
    sort_order = "desc",
    search,
    has_deadline,
    deadline_before,
    deadline_after,
  } = req.query;

  const allowedSortFields = [
    "title", "status", "created_at", "started_at", "completed_at",
    "deadline", "time_estimate_minutes", "effort", "priority", "cost",
  ];
  const sortField = allowedSortFields.includes(sort_by as string) ? sort_by : "created_at";
  const sortOrder = sort_order === "asc" ? "ASC" : "DESC";

  let query = "SELECT * FROM tasks WHERE user_id = ?";
  const params: any[] = [userId];

  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  if (priority) {
    query += " AND priority = ?";
    params.push(priority);
  }
  if (effort) {
    query += " AND effort = ?";
    params.push(effort);
  }
  if (search) {
    query += " AND (title LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }
  if (has_deadline === "true") {
    query += " AND deadline IS NOT NULL";
  } else if (has_deadline === "false") {
    query += " AND deadline IS NULL";
  }
  if (deadline_before) {
    query += " AND deadline <= ?";
    params.push(deadline_before);
  }
  if (deadline_after) {
    query += " AND deadline >= ?";
    params.push(deadline_after);
  }

  query += ` ORDER BY ${sortField} ${sortOrder}`;

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// Get a single task
router.get("/:id", (req: AuthRequest, res: Response) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(
    req.params.id,
    req.userId!
  );
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(task);
});

// Create a new task
router.post("/", (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const {
    title,
    description,
    status = "PENDING",
    deadline,
    time_estimate_minutes,
    effort = "MEDIUM",
    priority = "MEDIUM",
    cost,
    materials,
  } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const result = db.prepare(`
    INSERT INTO tasks (user_id, title, description, status, deadline, time_estimate_minutes, effort, priority, cost, materials)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, title, description || null, status, deadline || null, time_estimate_minutes || null, effort, priority, cost || null, materials || null);

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(task);
});

// Update a task
router.put("/:id", (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const taskId = req.params.id;

  const existing = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(taskId, userId) as any;
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const {
    title = existing.title,
    description = existing.description,
    status = existing.status,
    deadline = existing.deadline,
    time_estimate_minutes = existing.time_estimate_minutes,
    effort = existing.effort,
    priority = existing.priority,
    cost = existing.cost,
    materials = existing.materials,
  } = req.body;

  // Auto-set started_at when moving to IN_PROGRESS
  let started_at = existing.started_at;
  if (status === "IN_PROGRESS" && existing.status !== "IN_PROGRESS" && !started_at) {
    started_at = new Date().toISOString();
  }
  // Clear started_at when moving back to PENDING
  if (status === "PENDING" && existing.status !== "PENDING") {
    started_at = null;
  }

  // Auto-set completed_at when moving to COMPLETE
  let completed_at = existing.completed_at;
  if (status === "COMPLETE" && existing.status !== "COMPLETE") {
    completed_at = new Date().toISOString();
  } else if (status !== "COMPLETE") {
    completed_at = null;
  }

  db.prepare(`
    UPDATE tasks SET title = ?, description = ?, status = ?, deadline = ?,
    time_estimate_minutes = ?, effort = ?, priority = ?, cost = ?, materials = ?,
    started_at = ?, completed_at = ?
    WHERE id = ? AND user_id = ?
  `).run(title, description, status, deadline, time_estimate_minutes, effort, priority, cost, materials, started_at, completed_at, taskId, userId);

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  res.json(task);
});

// Clone a task
router.post("/:id/clone", (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const taskId = req.params.id;

  const existing = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(taskId, userId) as any;
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const result = db.prepare(`
    INSERT INTO tasks (user_id, title, description, status, deadline, time_estimate_minutes, effort, priority, cost, materials)
    VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    `${existing.title} (copy)`,
    existing.description,
    existing.deadline,
    existing.time_estimate_minutes,
    existing.effort,
    existing.priority,
    existing.cost,
    existing.materials
  );

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(task);
});

// Delete a task
router.delete("/:id", (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const result = db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(req.params.id, userId);
  if (result.changes === 0) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.status(204).send();
});

export default router;
