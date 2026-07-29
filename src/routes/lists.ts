import { Router, Response } from "express";
import pool from "../database";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// Get all lists for the user
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT * FROM task_lists WHERE user_id = $1 ORDER BY created_at DESC",
      [req.userId!]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching lists:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a single list with its tasks
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const listResult = await pool.query(
      "SELECT * FROM task_lists WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId!]
    );

    if (listResult.rows.length === 0) {
      res.status(404).json({ error: "List not found" });
      return;
    }

    const tasksResult = await pool.query(
      `SELECT t.*, tli.position, tli.added_at as added_to_list_at
       FROM tasks t
       JOIN task_list_items tli ON t.id = tli.task_id
       WHERE tli.task_list_id = $1
       ORDER BY tli.position ASC`,
      [req.params.id]
    );

    res.json({ ...listResult.rows[0], tasks: tasksResult.rows });
  } catch (err) {
    console.error("Error fetching list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new list
router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  try {
    const result = await pool.query(
      "INSERT INTO task_lists (user_id, name, description) VALUES ($1, $2, $3) RETURNING *",
      [req.userId!, name, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a list
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body;
  const listId = req.params.id;

  try {
    const existingResult = await pool.query(
      "SELECT * FROM task_lists WHERE id = $1 AND user_id = $2",
      [listId, req.userId!]
    );
    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: "List not found" });
      return;
    }

    const existing = existingResult.rows[0];
    const result = await pool.query(
      "UPDATE task_lists SET name = COALESCE($1, name), description = $2 WHERE id = $3 RETURNING *",
      [name || null, description !== undefined ? description : existing.description, listId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a list
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      "DELETE FROM task_lists WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId!]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: "List not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error("Error deleting list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add a task to a list
router.post("/:id/tasks", async (req: AuthRequest, res: Response) => {
  const listId = req.params.id;
  const { task_id } = req.body;

  if (!task_id) {
    res.status(400).json({ error: "task_id is required" });
    return;
  }

  try {
    // Verify list belongs to user
    const listResult = await pool.query(
      "SELECT * FROM task_lists WHERE id = $1 AND user_id = $2",
      [listId, req.userId!]
    );
    if (listResult.rows.length === 0) {
      res.status(404).json({ error: "List not found" });
      return;
    }

    // Verify task belongs to user
    const taskResult = await pool.query(
      "SELECT * FROM tasks WHERE id = $1 AND user_id = $2",
      [task_id, req.userId!]
    );
    if (taskResult.rows.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    // Get max position
    const maxPosResult = await pool.query(
      "SELECT MAX(position) as max_pos FROM task_list_items WHERE task_list_id = $1",
      [listId]
    );
    const position = (maxPosResult.rows[0]?.max_pos ?? -1) + 1;

    await pool.query(
      "INSERT INTO task_list_items (task_list_id, task_id, position) VALUES ($1, $2, $3)",
      [listId, task_id, position]
    );
    res.status(201).json({ message: "Task added to list", position });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "Task is already on this list" });
    } else {
      console.error("Error adding task to list:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Remove a task from a list
router.delete("/:id/tasks/:taskId", async (req: AuthRequest, res: Response) => {
  const listId = req.params.id;
  const taskId = req.params.taskId;

  try {
    // Verify list belongs to user
    const listResult = await pool.query(
      "SELECT * FROM task_lists WHERE id = $1 AND user_id = $2",
      [listId, req.userId!]
    );
    if (listResult.rows.length === 0) {
      res.status(404).json({ error: "List not found" });
      return;
    }

    const result = await pool.query(
      "DELETE FROM task_list_items WHERE task_list_id = $1 AND task_id = $2",
      [listId, taskId]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Task not on this list" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error("Error removing task from list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reorder tasks in a list
router.put("/:id/reorder", async (req: AuthRequest, res: Response) => {
  const listId = req.params.id;
  const { task_ids } = req.body;

  if (!Array.isArray(task_ids)) {
    res.status(400).json({ error: "task_ids array is required" });
    return;
  }

  try {
    const listResult = await pool.query(
      "SELECT * FROM task_lists WHERE id = $1 AND user_id = $2",
      [listId, req.userId!]
    );
    if (listResult.rows.length === 0) {
      res.status(404).json({ error: "List not found" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < task_ids.length; i++) {
        await client.query(
          "UPDATE task_list_items SET position = $1 WHERE task_list_id = $2 AND task_id = $3",
          [i, listId, task_ids[i]]
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
    console.error("Error reordering list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
