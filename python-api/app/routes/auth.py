from flask import Blueprint, request, jsonify
import bcrypt

from ..database import get_pool
from ..middleware import generate_token

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")

    if not username or not email or not password:
        return jsonify({"error": "username, email, and password are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM users WHERE username = %s OR email = %s",
                (username, email),
            )
            if cur.fetchone():
                return jsonify({"error": "Username or email already exists"}), 409

            password_hash = bcrypt.hashpw(
                password.encode("utf-8"), bcrypt.gensalt(10)
            ).decode("utf-8")

            cur.execute(
                "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s) RETURNING id",
                (username, email, password_hash),
            )
            user_id = cur.fetchone()[0]
        conn.commit()

        token = generate_token(user_id)
        return jsonify({"token": token, "userId": user_id, "username": username}), 201
    except Exception as e:
        conn.rollback()
        print(f"Registration error: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    login_value = data.get("login")
    password = data.get("password")

    if not login_value or not password:
        return jsonify({"error": "login and password are required"}), 400

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, password_hash FROM users WHERE username = %s OR email = %s",
                (login_value, login_value),
            )
            user = cur.fetchone()

        if not user:
            return jsonify({"error": "Invalid credentials"}), 401

        user_id, username, password_hash = user

        if not bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8")):
            return jsonify({"error": "Invalid credentials"}), 401

        token = generate_token(user_id)
        return jsonify({"token": token, "userId": user_id, "username": username}), 200
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        pool.putconn(conn)
