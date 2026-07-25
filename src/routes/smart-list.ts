import { Router, Response } from "express";
import db from "../database";
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
 * 
 * Uses a greedy approach: score all eligible tasks, pick the highest scoring
 * ones that fit within the time budget.
 */
function scoreTasks(tasks: Task[], availableMinutes: number): Array<Task & { score: number }> {
  const now = new Date();

  return tasks.map((task) => {
    let score = 0;

    // Priority scoring
    switch (task.priority) {
      case "HIGH": score += 30; break;
      case "MEDIUM": score += 20; break;
      case "LOW": score += 10; break;
    }

    // Deadline urgency scoring (closer deadline = higher score)
    if (task.deadline) {
      const deadlineDate = new Date(task.deadline);
      const daysUntilDeadline = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysUntilDeadline <= 0) {
        score += 50; // Overdue
      } else if (daysUntilDeadline <= 1) {
        score += 40; // Due today/tomorrow
      } else if (daysUntilDeadline <= 3) {
        score += 30;
      } else if (daysUntilDeadline <= 7) {
        score += 20;
      } else {
        score += 10;
      }
    }

    // Effort scoring — prefer tasks whose effort matches available time
    // HIGH effort tasks are less desirable for short time windows
    const estimate = task.time_estimate_minutes || 30; // default 30 min if no estimate
    if (estimate <= availableMinutes * 0.5) {
      // Task fits comfortably
      switch (task.effort) {
        case "LOW": score += 15; break;
        case "MEDIUM": score += 10; break;
        case "HIGH": score += 5; break;
      }
    } else {
      // Task takes a large portion of available time
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
router.post("/generate", (req: AuthRequest, res: Response) => {
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

  // Get all incomplete tasks with time estimates
  let query = "SELECT * FROM tasks WHERE user_id = ? AND status != 'COMPLETE'";
  const params: any[] = [userId];

  if (priority_filter) {
    query += " AND priority = ?";
    params.push(priority_filter);
  }
  if (effort_filter) {
    query += " AND effort = ?";
    params.push(effort_filter);
  }

  const allTasks = db.prepare(query).all(...params) as Task[];

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
    const listResult = db.prepare("INSERT INTO task_lists (user_id, name, description) VALUES (?, ?, ?)").run(
      userId,
      list_name,
      `Auto-generated list for ${available_minutes} minutes`
    );

    const insertItem = db.prepare("INSERT INTO task_list_items (task_list_id, task_id, position) VALUES (?, ?, ?)");
    const addTasks = db.transaction((tasks: Task[]) => {
      tasks.forEach((task, index) => {
        insertItem.run(listResult.lastInsertRowid, task.id, index);
      });
    });
    addTasks(selectedTasks);

    const list = db.prepare("SELECT * FROM task_lists WHERE id = ?").get(listResult.lastInsertRowid);
    res.status(201).json({
      list,
      tasks: selectedTasks,
      total_estimated_minutes: available_minutes - remainingMinutes,
      remaining_minutes: remainingMinutes,
    });
  } else {
    // Just return the suggestion without creating
    res.json({
      tasks: selectedTasks,
      total_estimated_minutes: available_minutes - remainingMinutes,
      remaining_minutes: remainingMinutes,
    });
  }
});

export default router;
