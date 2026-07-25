import { Router, Response } from "express";
import db from "../database";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// Get all lists for the user
router.get("/", (req: AuthRequest, res: Response) => {
  const lists = db.prepare("SELECT * FROM task_lists WHERE user_id = ? ORDER BY created_at DESC").all(req.userId!);
  res.json(lists);
});

// Get a single list with its tasks
router.get("/:id", (req: AuthRequest, res: Response) => {
  const list = db.prepare("SELECT * FROM task_lists WHERE id = ? AND user_id = ?").get(
    req.params.id,
    req.userId!
  ) as any;

  if (!list) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  const tasks = db.prepare(`
    SELECT t.*, tli.position, tli.added_at as added_to_list_at
    FROM tasks t
    JOIN task_list_items tli ON t.id = tli.task_id
    WHERE tli.task_list_id = ?
    ORDER BY tli.position ASC
  `).all(req.params.id);

  res.json({ ...list, tasks });
});

// Create a new list
router.post("/", (req: AuthRequest, res: Response) => {
  const { name, description } = req.body;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const result = db.prepare("INSERT INTO task_lists (user_id, name, description) VALUES (?, ?, ?)").run(
    req.userId!,
    name,
    description || null
  );

  const list = db.prepare("SELECT * FROM task_lists WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(list);
});

// Update a list
router.put("/:id", (req: AuthRequest, res: Response) => {
  const { name, description } = req.body;
  const listId = req.params.id;

  const existing = db.prepare("SELECT * FROM task_lists WHERE id = ? AND user_id = ?").get(listId, req.userId!);
  if (!existing) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  db.prepare("UPDATE task_lists SET name = COALESCE(?, name), description = ? WHERE id = ?").run(
    name || null,
    description !== undefined ? description : (existing as any).description,
    listId
  );

  const list = db.prepare("SELECT * FROM task_lists WHERE id = ?").get(listId);
  res.json(list);
});

// Delete a list
router.delete("/:id", (req: AuthRequest, res: Response) => {
  const result = db.prepare("DELETE FROM task_lists WHERE id = ? AND user_id = ?").run(req.params.id, req.userId!);
  if (result.changes === 0) {
    res.status(404).json({ error: "List not found" });
    return;
  }
  res.status(204).send();
});

// Add a task to a list
router.post("/:id/tasks", (req: AuthRequest, res: Response) => {
  const listId = req.params.id;
  const { task_id } = req.body;

  if (!task_id) {
    res.status(400).json({ error: "task_id is required" });
    return;
  }

  // Verify list belongs to user
  const list = db.prepare("SELECT * FROM task_lists WHERE id = ? AND user_id = ?").get(listId, req.userId!);
  if (!list) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  // Verify task belongs to user
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(task_id, req.userId!);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // Get max position
  const maxPos = db.prepare("SELECT MAX(position) as max_pos FROM task_list_items WHERE task_list_id = ?").get(listId) as any;
  const position = (maxPos?.max_pos ?? -1) + 1;

  try {
    db.prepare("INSERT INTO task_list_items (task_list_id, task_id, position) VALUES (?, ?, ?)").run(listId, task_id, position);
    res.status(201).json({ message: "Task added to list", position });
  } catch (err: any) {
    if (err.message?.includes("UNIQUE")) {
      res.status(409).json({ error: "Task is already on this list" });
    } else {
      throw err;
    }
  }
});

// Remove a task from a list
router.delete("/:id/tasks/:taskId", (req: AuthRequest, res: Response) => {
  const listId = req.params.id;
  const taskId = req.params.taskId;

  // Verify list belongs to user
  const list = db.prepare("SELECT * FROM task_lists WHERE id = ? AND user_id = ?").get(listId, req.userId!);
  if (!list) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  const result = db.prepare("DELETE FROM task_list_items WHERE task_list_id = ? AND task_id = ?").run(listId, taskId);
  if (result.changes === 0) {
    res.status(404).json({ error: "Task not on this list" });
    return;
  }
  res.status(204).send();
});

// Reorder tasks in a list
router.put("/:id/reorder", (req: AuthRequest, res: Response) => {
  const listId = req.params.id;
  const { task_ids } = req.body;

  if (!Array.isArray(task_ids)) {
    res.status(400).json({ error: "task_ids array is required" });
    return;
  }

  const list = db.prepare("SELECT * FROM task_lists WHERE id = ? AND user_id = ?").get(listId, req.userId!);
  if (!list) {
    res.status(404).json({ error: "List not found" });
    return;
  }

  const updateStmt = db.prepare("UPDATE task_list_items SET position = ? WHERE task_list_id = ? AND task_id = ?");
  const reorder = db.transaction((ids: number[]) => {
    ids.forEach((taskId, index) => {
      updateStmt.run(index, listId, taskId);
    });
  });

  reorder(task_ids);
  res.json({ message: "Reordered successfully" });
});

export default router;
