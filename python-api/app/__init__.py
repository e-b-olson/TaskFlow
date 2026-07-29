import os

from flask import Flask, send_from_directory
from flask_cors import CORS

from .database import init_db, get_pool
from .routes.auth import auth_bp
from .routes.tasks import tasks_bp
from .routes.lists import lists_bp
from .routes.smart_list import smart_list_bp


def create_app():
    static_dir = os.environ.get("STATIC_DIR", os.path.join(os.path.dirname(__file__), "..", "public"))
    static_dir = os.path.abspath(static_dir)

    app = Flask(__name__, static_folder=static_dir, static_url_path="")
    CORS(app)

    app.config["JWT_SECRET"] = "change-me-in-production"

    with app.app_context():
        init_db()

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(tasks_bp, url_prefix="/api/tasks")
    app.register_blueprint(lists_bp, url_prefix="/api/lists")
    app.register_blueprint(smart_list_bp, url_prefix="/api/smart-list")

    # SPA fallback - serve index.html for non-API routes
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        if path and os.path.exists(os.path.join(static_dir, path)):
            return send_from_directory(static_dir, path)
        return send_from_directory(static_dir, "index.html")

    return app
