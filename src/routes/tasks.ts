import { Router, Response } from "express";
import pool from "../database";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

/**
 * Check if setting proposedParentId as the parent of taskId would create a cycle.
 * Walks up the ancestor chain from proposedParentId. If taskId appears among
 * the ancestors, assigning it would create a loop.
 */
async function wouldCreateCycle(taskId: number, proposedParentId: number | null): Promise<boolean> {
  if (proposedParentId === null) return false;
  if (taskId === proposedParentId) return true;

  const result = await pool.query(`
    WITH RECURSIVE ancestors AS (
      SELECT parent_task_id FROM tasks WHERE id = $1
      UNION ALL
      SELECT t.parent_task_id FROM tasks t
      JOIN ancestors a ON t.id = a.parent_task_id
    )
    SELECT 1 FROM ancestors WHERE parent_task_id = $2 LIMIT 1
  `, [proposedParentId, taskId]);

  return result.rows.length > 0;
}

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

  let query = "SELECT * FROM tasks WHERE user_id = $1 AND parent_task_id IS NULL";
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
    parent_task_id,
  } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  try {
    // Validate parent_task_id exists and belongs to this user
    if (parent_task_id) {
      const parentCheck = await pool.query(
        "SELECT id FROM tasks WHERE id = $1 AND user_id = $2",
        [parent_task_id, userId]
      );
      if (parentCheck.rows.length === 0) {
        res.status(404).json({ error: "Parent task not found" });
        return;
      }
    }

    // Auto-assign position for sub-tasks (append to end)
    let position = 0;
    if (parent_task_id) {
      const maxPosResult = await pool.query(
        "SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM tasks WHERE parent_task_id = $1",
        [parent_task_id]
      );
      position = maxPosResult.rows[0].next_pos;
    }

    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, status, deadline,
       time_estimate_minutes, effort, priority, cost, materials, parent_task_id, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [userId, title, description || null, status, deadline || null,
       time_estimate_minutes || null, effort, priority, cost || null, materials || null,
       parent_task_id || null, position]
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
      parent_task_id = existing.parent_task_id,
    } = req.body;

    // Check for inheritance loop when parent_task_id is being changed
    if (parent_task_id !== existing.parent_task_id) {
      if (parent_task_id !== null && parent_task_id !== undefined) {
        // Validate parent exists and belongs to user
        const parentCheck = await pool.query(
          "SELECT id FROM tasks WHERE id = $1 AND user_id = $2",
          [parent_task_id, userId]
        );
        if (parentCheck.rows.length === 0) {
          res.status(404).json({ error: "Parent task not found" });
          return;
        }

        // Check for cycle
        if (await wouldCreateCycle(Number(taskId), Number(parent_task_id))) {
          res.status(400).json({ error: "Cannot set parent: would create a cycle" });
          return;
        }
      }
    }

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
       started_at = $10, completed_at = $11, parent_task_id = $12
       WHERE id = $13 AND user_id = $14
       RETURNING *`,
      [title, description, status, deadline, time_estimate_minutes, effort,
       priority, cost, materials, started_at, completed_at, parent_task_id,
       taskId, userId]
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

    // Auto-assign position (append to end of sibling list)
    let position = 0;
    if (existing.parent_task_id) {
      const maxPosResult = await pool.query(
        "SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM tasks WHERE parent_task_id = $1",
        [existing.parent_task_id]
      );
      position = maxPosResult.rows[0].next_pos;
    }

    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, status, deadline,
       time_estimate_minutes, effort, priority, cost, materials, parent_task_id, position)
       VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [userId, `${existing.title} (copy)`, existing.description,
       existing.deadline, existing.time_estimate_minutes, existing.effort,
       existing.priority, existing.cost, existing.materials, existing.parent_task_id, position]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error cloning task:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get sub-tasks of a task, ordered by position
router.get("/:id/subtasks", async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const taskId = req.params.id;

  try {
    // Verify parent task exists and belongs to user
    const parentResult = await pool.query(
      "SELECT id FROM tasks WHERE id = $1 AND user_id = $2",
      [taskId, userId]
    );
    if (parentResult.rows.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const result = await pool.query(
      "SELECT * FROM tasks WHERE parent_task_id = $1 ORDER BY position ASC",
      [taskId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching subtasks:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reorder sub-tasks of a task
router.put("/:id/reorder", async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const taskId = req.params.id;
  const { task_ids } = req.body;

  if (!Array.isArray(task_ids)) {
    res.status(400).json({ error: "task_ids array is required" });
    return;
  }

  try {
    // Verify parent task exists and belongs to user
    const parentResult = await pool.query(
      "SELECT id FROM tasks WHERE id = $1 AND user_id = $2",
      [taskId, userId]
    );
    if (parentResult.rows.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < task_ids.length; i++) {
        await client.query(
          "UPDATE tasks SET position = $1 WHERE id = $2 AND parent_task_id = $3",
          [i, task_ids[i], taskId]
        );
      }
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ message: "Reordered successfully" });
  } catch (err) {
    console.error("Error reordering subtasks:", err);
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
