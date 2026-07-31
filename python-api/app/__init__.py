import os

from flask import Flask, send_from_directory, request, make_response
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

    def _serve_index():
        """Serve index.html with base path placeholder replaced."""
        prefix = request.headers.get("X-Forwarded-Prefix", os.environ.get("BASE_PATH", ""))
        base_path = prefix.rstrip("/")

        index_path = os.path.join(static_dir, "index.html")
        with open(index_path, "r") as f:
            html = f.read()
        html = html.replace("__BASE_PATH__", base_path)
        resp = make_response(html)
        resp.headers["Content-Type"] = "text/html; charset=utf-8"
        return resp

    # SPA fallback - serve index.html for non-API routes
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        if path and os.path.exists(os.path.join(static_dir, path)):
            return send_from_directory(static_dir, path)
        # Only serve index.html for routes without a file extension (SPA navigation)
        # Requests for missing static files should get a 404, not index.html
        if path and "." in path.split("/")[-1]:
            return "Not found", 404
        return _serve_index()

    return app
