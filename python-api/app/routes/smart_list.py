from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

from ..database import get_pool
from ..middleware import authenticate

smart_list_bp = Blueprint("smart_list", __name__)


def _serialize_task(row):
    """Convert a task row dict to JSON-serializable format."""
    result = dict(row)
    for key in ("created_at", "started_at", "completed_at", "deadline"):
        if key in result and result[key] is not None:
            result[key] = result[key].isoformat()
    return result


def _score_tasks(tasks, available_minutes):
    """
    Smart list scoring algorithm.

    Considers:
    - Priority (HIGH=30, MEDIUM=20, LOW=10)
    - Deadline urgency (closer deadline = higher score)
    - Effort relative to available time (prefers tasks that fit well)
    """
    now = datetime.now(timezone.utc)
    scored = []

    for task in tasks:
        score = 0

        # Priority score
        priority = task.get("priority", "MEDIUM")
        if priority == "HIGH":
            score += 30
        elif priority == "MEDIUM":
            score += 20
        else:
            score += 10

        # Deadline urgency score
        deadline = task.get("deadline")
        if deadline:
            if isinstance(deadline, str):
                deadline_dt = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
            else:
                deadline_dt = deadline if deadline.tzinfo else deadline.replace(tzinfo=timezone.utc)
            days_until = (deadline_dt - now).total_seconds() / (60 * 60 * 24)
            if days_until <= 0:
                score += 50
            elif days_until <= 1:
                score += 40
            elif days_until <= 3:
                score += 30
            elif days_until <= 7:
                score += 20
            else:
                score += 10

        # Effort score relative to available time
        estimate = task.get("time_estimate_minutes") or 30
        effort = task.get("effort", "MEDIUM")
        if estimate <= available_minutes * 0.5:
            if effort == "LOW":
                score += 15
            elif effort == "MEDIUM":
                score += 10
            else:
                score += 5
        else:
            if effort == "LOW":
                score += 10
            elif effort == "MEDIUM":
                score += 5
            else:
                score += 2

        scored_task = dict(task)
        scored_task["score"] = score
        scored.append(scored_task)

    return scored


@smart_list_bp.route("/generate", methods=["POST"])
@authenticate
def generate_smart_list():
    user_id = request.user_id
    data = request.get_json() or {}

    available_minutes = data.get("available_minutes")
    list_name = data.get("list_name")
    priority_filter = data.get("priority_filter")
    effort_filter = data.get("effort_filter")
    exclude_task_ids = data.get("exclude_task_ids", [])

    if not available_minutes or available_minutes <= 0:
        return jsonify({"error": "available_minutes is required and must be positive"}), 400

    pool = get_pool()
    conn = pool.getconn()
    try:
        query = "SELECT * FROM tasks WHERE user_id = %s AND status != 'COMPLETE'"
        params = [user_id]

        if priority_filter:
            query += " AND priority = %s"
            params.append(priority_filter)
        if effort_filter:
            query += " AND effort = %s"
            params.append(effort_filter)

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            all_tasks = cur.fetchall()

        # Filter out excluded tasks
        exclude_set = set(exclude_task_ids)
        eligible_tasks = [t for t in all_tasks if t["id"] not in exclude_set]

        # Score and sort tasks
        scored_tasks = _score_tasks(eligible_tasks, available_minutes)
        scored_tasks.sort(key=lambda t: t["score"], reverse=True)

        # Greedy selection: pick highest-scoring tasks that fit
        selected_tasks = []
        remaining_minutes = available_minutes

        for task in scored_tasks:
            estimate = task.get("time_estimate_minutes") or 30
            if estimate <= remaining_minutes:
                selected_tasks.append(task)
                remaining_minutes -= estimate
            if remaining_minutes <= 0:
                break

        total_estimated = available_minutes - remaining_minutes

        # Optionally create the list
        if list_name:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "INSERT INTO task_lists (user_id, name, description) VALUES (%s, %s, %s) RETURNING *",
                    (user_id, list_name, f"Auto-generated list for {available_minutes} minutes"),
                )
                list_row = cur.fetchone()

                for i, task in enumerate(selected_tasks):
                    cur.execute(
                        "INSERT INTO task_list_items (task_list_id, task_id, position) VALUES (%s, %s, %s)",
                        (list_row["id"], task["id"], i),
                    )
            conn.commit()

            return jsonify({
                "list": _serialize_task(list_row),
                "tasks": [_serialize_task(t) for t in selected_tasks],
                "total_estimated_minutes": total_estimated,
                "remaining_minutes": remaining_minutes,
            }), 201
        else:
            return jsonify({
                "tasks": [_serialize_task(t) for t in selected_tasks],
                "total_estimated_minutes": total_estimated,
                "remaining_minutes": remaining_minutes,
            }), 200
    except Exception as e:
        conn.rollback()
        print(f"Error generating smart list: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)
