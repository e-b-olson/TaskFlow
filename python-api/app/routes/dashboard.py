from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

from ..database import get_pool
from ..middleware import authenticate

dashboard_bp = Blueprint("dashboard", __name__)


def _serialize_task(row):
    """Convert a task row dict to JSON-serializable format."""
    result = dict(row)
    for key in ("created_at", "started_at", "completed_at", "deadline"):
        if key in result and result[key] is not None:
            result[key] = result[key].isoformat()
    return result


@dashboard_bp.route("/top-task", methods=["GET"])
@authenticate
def get_top_task():
    """Get the highest priority task with the earliest deadline.

    Tie-breaking order:
    1. Priority (HIGH > MEDIUM > LOW)
    2. Earliest deadline (NULLs last)
    3. Shortest time estimate (NULLs last)
    4. Shortest materials list (NULLs last)
    5. Earliest created_at
    """
    user_id = request.user_id

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM tasks
                WHERE user_id = %s AND status != 'COMPLETE'
                ORDER BY
                    CASE priority
                        WHEN 'HIGH' THEN 1
                        WHEN 'MEDIUM' THEN 2
                        WHEN 'LOW' THEN 3
                    END ASC,
                    CASE WHEN deadline IS NULL THEN 1 ELSE 0 END ASC,
                    deadline ASC,
                    CASE WHEN time_estimate_minutes IS NULL THEN 1 ELSE 0 END ASC,
                    time_estimate_minutes ASC,
                    CASE WHEN materials IS NULL THEN 1 ELSE 0 END ASC,
                    LENGTH(COALESCE(materials, '')) ASC,
                    created_at ASC
                LIMIT 1
            """, (user_id,))
            row = cur.fetchone()

        if not row:
            return jsonify(None), 200

        return jsonify(_serialize_task(row)), 200
    except Exception as e:
        print(f"Error fetching top task: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@dashboard_bp.route("/recent-list", methods=["GET"])
@authenticate
def get_recent_list():
    """Get the most recently accessed list.

    Uses the most recent added_at timestamp in task_list_items as a proxy
    for recent activity, falling back to the most recently created list.
    """
    user_id = request.user_id

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Find list with most recent activity (last item added or list created)
            cur.execute("""
                SELECT tl.*, COALESCE(MAX(tli.added_at), tl.created_at) as last_activity
                FROM task_lists tl
                LEFT JOIN task_list_items tli ON tl.id = tli.task_list_id
                WHERE tl.user_id = %s
                GROUP BY tl.id
                ORDER BY last_activity DESC
                LIMIT 1
            """, (user_id,))
            row = cur.fetchone()

        if not row:
            return jsonify(None), 200

        result = dict(row)
        for key in ("created_at", "last_activity"):
            if key in result and result[key] is not None:
                result[key] = result[key].isoformat()

        return jsonify(result), 200
    except Exception as e:
        print(f"Error fetching recent list: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@dashboard_bp.route("/activity", methods=["GET"])
@authenticate
def get_activity():
    """Get task completion counts per day for the past year (for activity grid).

    Returns a dict mapping date strings (YYYY-MM-DD) to completion counts.
    """
    user_id = request.user_id

    pool = get_pool()
    conn = pool.getconn()
    try:
        now = datetime.now(timezone.utc)
        one_year_ago = now - timedelta(days=365)

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DATE(completed_at) as day, COUNT(*) as count
                FROM tasks
                WHERE user_id = %s
                  AND status = 'COMPLETE'
                  AND completed_at >= %s
                GROUP BY DATE(completed_at)
                ORDER BY day ASC
            """, (user_id, one_year_ago))
            rows = cur.fetchall()

        activity = {}
        for row in rows:
            activity[row["day"].isoformat()] = row["count"]

        return jsonify(activity), 200
    except Exception as e:
        print(f"Error fetching activity: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@dashboard_bp.route("/streak", methods=["GET"])
@authenticate
def get_streak():
    """Get the user's current daily streak and today's completed task (if any).

    The client sends their local timezone via ?tz= query param (e.g. America/New_York)
    so the server can determine the user's "today" and whether their streak is still alive.

    Returns: { streak: int, completedToday: bool, completedTask: object|null }
    """
    from zoneinfo import ZoneInfo

    user_id = request.user_id
    tz_name = request.args.get("tz", "UTC")

    try:
        user_tz = ZoneInfo(tz_name)
    except Exception:
        user_tz = ZoneInfo("UTC")

    user_today = datetime.now(user_tz).date()
    user_yesterday = user_today - timedelta(days=1)

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT current_streak, last_completed_date, completed_task_id
                FROM daily_streaks
                WHERE user_id = %s
            """, (user_id,))
            row = cur.fetchone()

            if not row or not row["last_completed_date"]:
                return jsonify({"streak": 0, "completedToday": False, "completedTask": None}), 200

            last_date = row["last_completed_date"]
            streak = row["current_streak"]
            task_id = row["completed_task_id"]

            if last_date == user_today:
                # Fetch the completed task details
                completed_task = None
                if task_id:
                    cur.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
                    task_row = cur.fetchone()
                    if task_row:
                        completed_task = _serialize_task(task_row)
                return jsonify({"streak": streak, "completedToday": True, "completedTask": completed_task}), 200
            elif last_date == user_yesterday:
                # Streak is alive but not yet completed today
                return jsonify({"streak": streak, "completedToday": False, "completedTask": None}), 200
            else:
                # Streak is broken
                return jsonify({"streak": 0, "completedToday": False, "completedTask": None}), 200
    except Exception as e:
        print(f"Error fetching streak: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@dashboard_bp.route("/streak/complete", methods=["POST"])
@authenticate
def complete_streak():
    """Record that the user completed their daily top task.

    The client sends their local timezone and the task ID in the request body.

    Body: { "tz": "America/New_York", "task_id": 123 }
    Returns: { streak: int, completedToday: true }
    """
    from zoneinfo import ZoneInfo

    user_id = request.user_id
    data = request.get_json(silent=True) or {}
    tz_name = data.get("tz", "UTC")
    task_id = data.get("task_id")

    try:
        user_tz = ZoneInfo(tz_name)
    except Exception:
        user_tz = ZoneInfo("UTC")

    user_today = datetime.now(user_tz).date()
    user_yesterday = user_today - timedelta(days=1)

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT current_streak, last_completed_date
                FROM daily_streaks
                WHERE user_id = %s
            """, (user_id,))
            row = cur.fetchone()

            if not row:
                # First time — start streak at 1
                cur.execute("""
                    INSERT INTO daily_streaks (user_id, current_streak, last_completed_date, completed_task_id)
                    VALUES (%s, 1, %s, %s)
                """, (user_id, user_today, task_id))
                conn.commit()
                return jsonify({"streak": 1, "completedToday": True}), 200

            last_date = row["last_completed_date"]

            # Already completed today
            if last_date == user_today:
                return jsonify({"streak": row["current_streak"], "completedToday": True}), 200

            # Continuing streak from yesterday
            if last_date == user_yesterday:
                new_streak = row["current_streak"] + 1
            else:
                # Streak was broken, starting fresh
                new_streak = 1

            cur.execute("""
                UPDATE daily_streaks
                SET current_streak = %s, last_completed_date = %s, completed_task_id = %s
                WHERE user_id = %s
            """, (new_streak, user_today, task_id, user_id))
            conn.commit()

            return jsonify({"streak": new_streak, "completedToday": True}), 200
    except Exception as e:
        conn.rollback()
        print(f"Error recording streak: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)
