import os
from functools import wraps
from datetime import datetime, timedelta, timezone

import jwt
from flask import request, jsonify, current_app


def get_jwt_secret():
    return os.environ.get("JWT_SECRET", current_app.config.get("JWT_SECRET", "change-me-in-production"))


def generate_token(user_id: int) -> str:
    payload = {
        "userId": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm="HS256")


def authenticate(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")

        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentication required"}), 401

        token = auth_header[7:]

        try:
            payload = jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
            request.user_id = payload["userId"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Invalid or expired token"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid or expired token"}), 401

        return f(*args, **kwargs)

    return decorated
