import { Router, Response } from "express";
import pool from "../database";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// Get all tasks for the user with optional sort and filter
router.get("/", async (req: AuthRequest, res: Response) => {
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

  let query = "SELECT * FROM tasks WHERE user_id = $1";
  const params: any[] = [userId];
  let paramIndex = 2;

  if (status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(status);
  }
  if (priority) {
    query += ` AND priority = $${paramIndex++}`;
    params.push(priority);
  }
  if (effort) {
    query += ` AND effort = $${paramIndex++}`;
    params.push(effort);
  }
  if (search) {
    query += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }
  if (has_deadline === "true") {
    query += " AND deadline IS NOT NULL";
  } else if (has_deadline === "false") {
    query += " AND deadline IS NULL";
  }
  if (deadline_before) {
    query += ` AND deadline <= $${paramIndex++}`;
    params.push(deadline_before);
  }
  if (deadline_after) {
    query += ` AND deadline >= $${paramIndex++}`;
    params.push(deadline_after);
  }

  query += ` ORDER BY ${sortField} ${sortOrder}`;

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a single task
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT * FROM tasks WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId!]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching task:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new task
router.post("/", async (req: AuthRequest, res: Response) => {
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

  try {
    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, status, deadline,
       time_estimate_minutes, effort, priority, cost, materials)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId, title, description || null, status, deadline || null,
       time_estimate_minutes || null, effort, priority, cost || null, materials || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a task
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const taskId = req.params.id;

  try {
    const existingResult = await pool.query(
      "SELECT * FROM tasks WHERE id = $1 AND user_id = $2",
      [taskId, userId]
    );
    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const existing = existingResult.rows[0];
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

    const result = await pool.query(
      `UPDATE tasks SET title = $1, description = $2, status = $3, deadline = $4,
       time_estimate_minutes = $5, effort = $6, priority = $7, cost = $8, materials = $9,
       started_at = $10, completed_at = $11
       WHERE id = $12 AND user_id = $13
       RETURNING *`,
      [title, description, status, deadline, time_estimate_minutes, effort,
       priority, cost, materials, started_at, completed_at, taskId, userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Clone a task
router.post("/:id/clone", async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const taskId = req.params.id;

  try {
    const existingResult = await pool.query(
      "SELECT * FROM tasks WHERE id = $1 AND user_id = $2",
      [taskId, userId]
    );
    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const existing = existingResult.rows[0];
    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, status, deadline,
       time_estimate_minutes, effort, priority, cost, materials)
       VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, `${existing.title} (copy)`, existing.description,
       existing.deadline, existing.time_estimate_minutes, existing.effort,
       existing.priority, existing.cost, existing.materials]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error cloning task:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a task
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      "DELETE FROM tasks WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId!]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
