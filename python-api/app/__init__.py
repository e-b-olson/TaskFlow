import os

from flask import Flask
from flask_cors import CORS

from .database import init_db, get_pool
from .routes.auth import auth_bp
from .routes.tasks import tasks_bp
from .routes.lists import lists_bp
from .routes.smart_list import smart_list_bp
from .routes.dashboard import dashboard_bp


def create_app():
    app = Flask(__name__)
    CORS(app)

    app.config["JWT_SECRET"] = os.environ.get("JWT_SECRET", "change-me-in-production")

    with app.app_context():
        init_db()

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(tasks_bp, url_prefix="/api/tasks")
    app.register_blueprint(lists_bp, url_prefix="/api/lists")
    app.register_blueprint(smart_list_bp, url_prefix="/api/smart-list")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")

    @app.route("/health")
    def health():
        return {"status": "ok"}

    return app
