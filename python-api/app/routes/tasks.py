from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

from ..database import get_pool
from ..middleware import authenticate

tasks_bp = Blueprint("tasks", __name__)


def _serialize_task(row):
    """Convert a task row dict to JSON-serializable format."""
    result = dict(row)
    for key in ("created_at", "started_at", "completed_at", "deadline", "added_to_list_at"):
        if key in result and result[key] is not None:
            result[key] = result[key].isoformat()
    return result


@tasks_bp.route("", methods=["GET"])
@authenticate
def get_tasks():
    user_id = request.user_id
    status = request.args.get("status")
    priority = request.args.get("priority")
    effort = request.args.get("effort")
    sort_by = request.args.get("sort_by", "created_at")
    sort_order = request.args.get("sort_order", "desc")
    search = request.args.get("search")
    has_deadline = request.args.get("has_deadline")
    deadline_before = request.args.get("deadline_before")
    deadline_after = request.args.get("deadline_after")

    allowed_sort_fields = [
        "title", "status", "created_at", "started_at", "completed_at",
        "deadline", "time_estimate_minutes", "effort", "priority", "cost",
    ]
    sort_field = sort_by if sort_by in allowed_sort_fields else "created_at"
    order = "ASC" if sort_order == "asc" else "DESC"

    query = "SELECT * FROM tasks WHERE user_id = %s"
    params = [user_id]

    if status:
        query += " AND status = %s"
        params.append(status)
    if priority:
        query += " AND priority = %s"
        params.append(priority)
    if effort:
        query += " AND effort = %s"
        params.append(effort)
    if search:
        query += " AND (title ILIKE %s OR description ILIKE %s)"
        params.extend([f"%{search}%", f"%{search}%"])
    if has_deadline == "true":
        query += " AND deadline IS NOT NULL"
    elif has_deadline == "false":
        query += " AND deadline IS NULL"
    if deadline_before:
        query += " AND deadline <= %s"
        params.append(deadline_before)
    if deadline_after:
        query += " AND deadline >= %s"
        params.append(deadline_after)

    query += f" ORDER BY {sort_field} {order}"

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
        return jsonify([_serialize_task(r) for r in rows]), 200
    except Exception as e:
        print(f"Error fetching tasks: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@tasks_bp.route("/<int:task_id>", methods=["GET"])
@authenticate
def get_task(task_id):
    user_id = request.user_id

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM tasks WHERE id = %s AND user_id = %s",
                (task_id, user_id),
            )
            row = cur.fetchone()
        if not row:
            return jsonify({"error": "Task not found"}), 404
        return jsonify(_serialize_task(row)), 200
    except Exception as e:
        print(f"Error fetching task: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@tasks_bp.route("", methods=["POST"])
@authenticate
def create_task():
    user_id = request.user_id
    data = request.get_json() or {}

    title = data.get("title")
    if not title:
        return jsonify({"error": "title is required"}), 400

    description = data.get("description")
    status = data.get("status", "PENDING")
    deadline = data.get("deadline")
    time_estimate_minutes = data.get("time_estimate_minutes")
    effort = data.get("effort", "MEDIUM")
    priority = data.get("priority", "MEDIUM")
    cost = data.get("cost")
    materials = data.get("materials")

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """INSERT INTO tasks (user_id, title, description, status, deadline,
                   time_estimate_minutes, effort, priority, cost, materials)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING *""",
                (user_id, title, description, status, deadline,
                 time_estimate_minutes, effort, priority, cost, materials),
            )
            row = cur.fetchone()
        conn.commit()
        return jsonify(_serialize_task(row)), 201
    except Exception as e:
        conn.rollback()
        print(f"Error creating task: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@tasks_bp.route("/<int:task_id>", methods=["PUT"])
@authenticate
def update_task(task_id):
    user_id = request.user_id
    data = request.get_json() or {}

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM tasks WHERE id = %s AND user_id = %s",
                (task_id, user_id),
            )
            existing = cur.fetchone()

        if not existing:
            return jsonify({"error": "Task not found"}), 404

        title = data.get("title", existing["title"])
        description = data.get("description", existing["description"])
        status = data.get("status", existing["status"])
        deadline = data.get("deadline", existing["deadline"])
        time_estimate_minutes = data.get("time_estimate_minutes", existing["time_estimate_minutes"])
        effort = data.get("effort", existing["effort"])
        priority = data.get("priority", existing["priority"])
        cost = data.get("cost", existing["cost"])
        materials = data.get("materials", existing["materials"])

        # Auto-set started_at when moving to IN_PROGRESS
        started_at = existing["started_at"]
        if status == "IN_PROGRESS" and existing["status"] != "IN_PROGRESS" and not started_at:
            started_at = datetime.now(timezone.utc).isoformat()
        if status == "PENDING" and existing["status"] != "PENDING":
            started_at = None

        # Auto-set completed_at when moving to COMPLETE
        completed_at = existing["completed_at"]
        if status == "COMPLETE" and existing["status"] != "COMPLETE":
            completed_at = datetime.now(timezone.utc).isoformat()
        elif status != "COMPLETE":
            completed_at = None

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """UPDATE tasks SET title = %s, description = %s, status = %s, deadline = %s,
                   time_estimate_minutes = %s, effort = %s, priority = %s, cost = %s, materials = %s,
                   started_at = %s, completed_at = %s
                   WHERE id = %s AND user_id = %s
                   RETURNING *""",
                (title, description, status, deadline, time_estimate_minutes, effort,
                 priority, cost, materials, started_at, completed_at, task_id, user_id),
            )
            row = cur.fetchone()
        conn.commit()
        return jsonify(_serialize_task(row)), 200
    except Exception as e:
        conn.rollback()
        print(f"Error updating task: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@tasks_bp.route("/<int:task_id>/clone", methods=["POST"])
@authenticate
def clone_task(task_id):
    user_id = request.user_id

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM tasks WHERE id = %s AND user_id = %s",
                (task_id, user_id),
            )
            existing = cur.fetchone()

        if not existing:
            return jsonify({"error": "Task not found"}), 404

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """INSERT INTO tasks (user_id, title, description, status, deadline,
                   time_estimate_minutes, effort, priority, cost, materials)
                   VALUES (%s, %s, %s, 'PENDING', %s, %s, %s, %s, %s, %s)
                   RETURNING *""",
                (user_id, f"{existing['title']} (copy)", existing["description"],
                 existing["deadline"], existing["time_estimate_minutes"], existing["effort"],
                 existing["priority"], existing["cost"], existing["materials"]),
            )
            row = cur.fetchone()
        conn.commit()
        return jsonify(_serialize_task(row)), 201
    except Exception as e:
        conn.rollback()
        print(f"Error cloning task: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@tasks_bp.route("/<int:task_id>", methods=["DELETE"])
@authenticate
def delete_task(task_id):
    user_id = request.user_id

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM tasks WHERE id = %s AND user_id = %s",
                (task_id, user_id),
            )
            if cur.rowcount == 0:
                return jsonify({"error": "Task not found"}), 404
        conn.commit()
        return "", 204
    except Exception as e:
        conn.rollback()
        print(f"Error deleting task: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)
