from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

from ..database import get_pool
from ..middleware import authenticate

lists_bp = Blueprint("lists", __name__)


def _serialize_row(row):
    """Convert a row dict to JSON-serializable format."""
    result = dict(row)
    for key in ("created_at", "added_at", "started_at", "completed_at", "deadline", "added_to_list_at"):
        if key in result and result[key] is not None:
            result[key] = result[key].isoformat()
    return result


@lists_bp.route("", methods=["GET"])
@authenticate
def get_lists():
    user_id = request.user_id

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM task_lists WHERE user_id = %s ORDER BY created_at DESC",
                (user_id,),
            )
            rows = cur.fetchall()
        return jsonify([_serialize_row(r) for r in rows]), 200
    except Exception as e:
        print(f"Error fetching lists: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@lists_bp.route("/<int:list_id>", methods=["GET"])
@authenticate
def get_list(list_id):
    user_id = request.user_id

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM task_lists WHERE id = %s AND user_id = %s",
                (list_id, user_id),
            )
            list_row = cur.fetchone()

        if not list_row:
            return jsonify({"error": "List not found"}), 404

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT t.*, tli.position, tli.added_at as added_to_list_at
                   FROM tasks t
                   JOIN task_list_items tli ON t.id = tli.task_id
                   WHERE tli.task_list_id = %s
                   ORDER BY tli.position ASC""",
                (list_id,),
            )
            tasks = cur.fetchall()

        result = _serialize_row(list_row)
        result["tasks"] = [_serialize_row(t) for t in tasks]
        return jsonify(result), 200
    except Exception as e:
        print(f"Error fetching list: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@lists_bp.route("", methods=["POST"])
@authenticate
def create_list():
    user_id = request.user_id
    data = request.get_json() or {}
    name = data.get("name")
    description = data.get("description")

    if not name:
        return jsonify({"error": "name is required"}), 400

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO task_lists (user_id, name, description) VALUES (%s, %s, %s) RETURNING *",
                (user_id, name, description),
            )
            row = cur.fetchone()
        conn.commit()
        return jsonify(_serialize_row(row)), 201
    except Exception as e:
        conn.rollback()
        print(f"Error creating list: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@lists_bp.route("/<int:list_id>", methods=["PUT"])
@authenticate
def update_list(list_id):
    user_id = request.user_id
    data = request.get_json() or {}
    name = data.get("name")
    description = data.get("description")

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM task_lists WHERE id = %s AND user_id = %s",
                (list_id, user_id),
            )
            existing = cur.fetchone()

        if not existing:
            return jsonify({"error": "List not found"}), 404

        new_description = description if description is not None else existing["description"]

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "UPDATE task_lists SET name = COALESCE(%s, name), description = %s WHERE id = %s RETURNING *",
                (name or None, new_description, list_id),
            )
            row = cur.fetchone()
        conn.commit()
        return jsonify(_serialize_row(row)), 200
    except Exception as e:
        conn.rollback()
        print(f"Error updating list: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@lists_bp.route("/<int:list_id>", methods=["DELETE"])
@authenticate
def delete_list(list_id):
    user_id = request.user_id

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM task_lists WHERE id = %s AND user_id = %s",
                (list_id, user_id),
            )
            if cur.rowcount == 0:
                return jsonify({"error": "List not found"}), 404
        conn.commit()
        return "", 204
    except Exception as e:
        conn.rollback()
        print(f"Error deleting list: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@lists_bp.route("/<int:list_id>/tasks", methods=["POST"])
@authenticate
def add_task_to_list(list_id):
    user_id = request.user_id
    data = request.get_json() or {}
    task_id = data.get("task_id")

    if not task_id:
        return jsonify({"error": "task_id is required"}), 400

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            # Verify list belongs to user
            cur.execute(
                "SELECT id FROM task_lists WHERE id = %s AND user_id = %s",
                (list_id, user_id),
            )
            if not cur.fetchone():
                return jsonify({"error": "List not found"}), 404

            # Verify task belongs to user
            cur.execute(
                "SELECT id FROM tasks WHERE id = %s AND user_id = %s",
                (task_id, user_id),
            )
            if not cur.fetchone():
                return jsonify({"error": "Task not found"}), 404

            # Get max position
            cur.execute(
                "SELECT MAX(position) as max_pos FROM task_list_items WHERE task_list_id = %s",
                (list_id,),
            )
            max_pos_row = cur.fetchone()
            position = (max_pos_row[0] if max_pos_row[0] is not None else -1) + 1

            cur.execute(
                "INSERT INTO task_list_items (task_list_id, task_id, position) VALUES (%s, %s, %s)",
                (list_id, task_id, position),
            )
        conn.commit()
        return jsonify({"message": "Task added to list", "position": position}), 201
    except Exception as e:
        conn.rollback()
        # Check for unique constraint violation
        if getattr(e, "pgcode", None) == "23505":
            return jsonify({"error": "Task is already on this list"}), 409
        print(f"Error adding task to list: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@lists_bp.route("/<int:list_id>/tasks/<int:task_id>", methods=["DELETE"])
@authenticate
def remove_task_from_list(list_id, task_id):
    user_id = request.user_id

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            # Verify list belongs to user
            cur.execute(
                "SELECT id FROM task_lists WHERE id = %s AND user_id = %s",
                (list_id, user_id),
            )
            if not cur.fetchone():
                return jsonify({"error": "List not found"}), 404

            cur.execute(
                "DELETE FROM task_list_items WHERE task_list_id = %s AND task_id = %s",
                (list_id, task_id),
            )
            if cur.rowcount == 0:
                return jsonify({"error": "Task not on this list"}), 404
        conn.commit()
        return "", 204
    except Exception as e:
        conn.rollback()
        print(f"Error removing task from list: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@lists_bp.route("/<int:list_id>/reorder", methods=["PUT"])
@authenticate
def reorder_list(list_id):
    user_id = request.user_id
    data = request.get_json() or {}
    task_ids = data.get("task_ids")

    if not isinstance(task_ids, list):
        return jsonify({"error": "task_ids array is required"}), 400

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM task_lists WHERE id = %s AND user_id = %s",
                (list_id, user_id),
            )
            if not cur.fetchone():
                return jsonify({"error": "List not found"}), 404

            for i, tid in enumerate(task_ids):
                cur.execute(
                    "UPDATE task_list_items SET position = %s WHERE task_list_id = %s AND task_id = %s",
                    (i, list_id, tid),
                )
        conn.commit()
        return jsonify({"message": "Reordered successfully"}), 200
    except Exception as e:
        conn.rollback()
        print(f"Error reordering list: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)
