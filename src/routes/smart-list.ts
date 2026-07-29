import { Router, Response } from "express";
import pool from "../database";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

interface Task {
  id: number;
  title: string;
  status: string;
  priority: string;
  effort: string;
  deadline: string | null;
  time_estimate_minutes: number | null;
}

/**
 * Smart list builder: selects tasks to fill a given time budget.
 *
 * Scoring algorithm considers:
 * - Priority (HIGH=30, MEDIUM=20, LOW=10)
 * - Deadline urgency (closer deadline = higher score)
 * - Effort relative to available time (prefers tasks that fit well)
 */
function scoreTasks(tasks: Task[], availableMinutes: number): Array<Task & { score: number }> {
  const now = new Date();

  return tasks.map((task) => {
    let score = 0;

    switch (task.priority) {
      case "HIGH": score += 30; break;
      case "MEDIUM": score += 20; break;
      case "LOW": score += 10; break;
    }

    if (task.deadline) {
      const deadlineDate = new Date(task.deadline);
      const daysUntilDeadline = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysUntilDeadline <= 0) score += 50;
      else if (daysUntilDeadline <= 1) score += 40;
      else if (daysUntilDeadline <= 3) score += 30;
      else if (daysUntilDeadline <= 7) score += 20;
      else score += 10;
    }

    const estimate = task.time_estimate_minutes || 30;
    if (estimate <= availableMinutes * 0.5) {
      switch (task.effort) {
        case "LOW": score += 15; break;
        case "MEDIUM": score += 10; break;
        case "HIGH": score += 5; break;
      }
    } else {
      switch (task.effort) {
        case "LOW": score += 10; break;
        case "MEDIUM": score += 5; break;
        case "HIGH": score += 2; break;
      }
    }

    return { ...task, score };
  });
}


// Generate a smart task list
router.post("/generate", async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const {
    available_minutes,
    list_name,
    priority_filter,
    effort_filter,
    exclude_task_ids = [],
  } = req.body;

  if (!available_minutes || available_minutes <= 0) {
    res.status(400).json({ error: "available_minutes is required and must be positive" });
    return;
  }

  try {
    let query = "SELECT * FROM tasks WHERE user_id = $1 AND status != 'COMPLETE'";
    const params: any[] = [userId];
    let paramIndex = 2;

    if (priority_filter) {
      query += ` AND priority = $${paramIndex++}`;
      params.push(priority_filter);
    }
    if (effort_filter) {
      query += ` AND effort = $${paramIndex++}`;
      params.push(effort_filter);
    }

    const allTasksResult = await pool.query(query, params);
    const allTasks = allTasksResult.rows as Task[];

    // Filter out excluded tasks
    const excludeSet = new Set(exclude_task_ids);
    const eligibleTasks = allTasks.filter((t) => !excludeSet.has(t.id));

    // Score and sort tasks
    const scoredTasks = scoreTasks(eligibleTasks, available_minutes);
    scoredTasks.sort((a, b) => b.score - a.score);

    // Greedy selection: pick highest-scoring tasks that fit
    const selectedTasks: Array<Task & { score: number }> = [];
    let remainingMinutes = available_minutes;

    for (const task of scoredTasks) {
      const estimate = task.time_estimate_minutes || 30;
      if (estimate <= remainingMinutes) {
        selectedTasks.push(task);
        remainingMinutes -= estimate;
      }
      if (remainingMinutes <= 0) break;
    }

    // Optionally create the list
    if (list_name) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const listResult = await client.query(
          "INSERT INTO task_lists (user_id, name, description) VALUES ($1, $2, $3) RETURNING *",
          [userId, list_name, `Auto-generated list for ${available_minutes} minutes`]
        );

        for (let i = 0; i < selectedTasks.length; i++) {
          await client.query(
            "INSERT INTO task_list_items (task_list_id, task_id, position) VALUES ($1, $2, $3)",
            [listResult.rows[0].id, selectedTasks[i].id, i]
          );
        }

        await client.query("COMMIT");

        res.status(201).json({
          list: listResult.rows[0],
          tasks: selectedTasks,
          total_estimated_minutes: available_minutes - remainingMinutes,
          remaining_minutes: remainingMinutes,
        });
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }
    } else {
      res.json({
        tasks: selectedTasks,
        total_estimated_minutes: available_minutes - remainingMinutes,
        remaining_minutes: remainingMinutes,
      });
    }
  } catch (err) {
    console.error("Error generating smart list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
