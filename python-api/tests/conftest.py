"""
Shared test fixtures for the ToDo API tests.

Uses a SEPARATE PostgreSQL test database (port 5434) to avoid touching app data.
Start the test DB with:
    docker compose -f docker-compose.test.yml up -d

Set TEST_DATABASE_URL env var to override the test database connection.
"""
import os
import pytest
from unittest.mock import patch

import psycopg2
from psycopg2.extras import RealDictCursor


# ---------------------------------------------------------------------------
# In-process test database setup using a real PostgreSQL connection
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://todo_test_user:todo_test_pass@localhost:5434/todo_test_db",
)

# Force the app module to use the test database URL when get_pool() is called
os.environ["DATABASE_URL"] = TEST_DATABASE_URL


def get_test_connection():
    """Get a raw psycopg2 connection for test setup."""
    return psycopg2.connect(TEST_DATABASE_URL)


def setup_test_tables(conn):
    """Create tables in the test database."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                parent_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                position INTEGER NOT NULL DEFAULT 0,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_PROGRESS', 'COMPLETE')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                deadline TIMESTAMPTZ,
                time_estimate_minutes INTEGER,
                effort TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(effort IN ('HIGH', 'MEDIUM', 'LOW')),
                priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('HIGH', 'MEDIUM', 'LOW')),
                cost REAL,
                materials TEXT
            );

            CREATE TABLE IF NOT EXISTS task_lists (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS task_list_items (
                id SERIAL PRIMARY KEY,
                task_list_id INTEGER NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
                task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                position INTEGER NOT NULL DEFAULT 0,
                added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(task_list_id, task_id)
            );
        """)
    conn.commit()


def clean_test_tables(conn):
    """Truncate all tables between tests."""
    with conn.cursor() as cur:
        cur.execute("""
            TRUNCATE task_list_items, task_lists, tasks, users RESTART IDENTITY CASCADE;
        """)
    conn.commit()


# ---------------------------------------------------------------------------
# Pytest fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def db_setup():
    """One-time database setup: create tables. Refuses to run against app DB."""
    # Safety check: never run tests against the app database
    if "5433" in TEST_DATABASE_URL and "todo_db" in TEST_DATABASE_URL:
        pytest.exit(
            "ABORTED: TEST_DATABASE_URL points to the app database (port 5433/todo_db). "
            "Tests require a separate test database. Run: "
            "docker compose -f docker-compose.test.yml up -d"
        )
    conn = get_test_connection()
    setup_test_tables(conn)
    conn.close()


@pytest.fixture(autouse=True)
def clean_db(db_setup):
    """Clean all tables before each test."""
    conn = get_test_connection()
    clean_test_tables(conn)
    conn.close()


@pytest.fixture()
def app(db_setup):
    """Create the Flask application configured for testing."""
    # Reset the cached pool so it picks up DATABASE_URL pointing to test DB
    import app.database as db_module
    db_module._pool = None

    from app import create_app
    application = create_app()
    application.config["TESTING"] = True
    application.config["JWT_SECRET"] = "test-secret"

    yield application

    # Reset pool after test to ensure clean state
    db_module._pool = None


@pytest.fixture()
def client(app):
    """Flask test client."""
    return app.test_client()


@pytest.fixture()
def auth_headers(client):
    """Register a user and return auth headers."""
    response = client.post("/api/auth/register", json={
        "username": "testuser",
        "email": "test@example.com",
        "password": "password123",
    })
    data = response.get_json()
    return {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"}


@pytest.fixture()
def second_user_headers(client):
    """Register a second user and return auth headers."""
    response = client.post("/api/auth/register", json={
        "username": "otheruser",
        "email": "other@example.com",
        "password": "password123",
    })
    data = response.get_json()
    return {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"}


@pytest.fixture()
def sample_task(client, auth_headers):
    """Create and return a sample task."""
    response = client.post("/api/tasks", json={
        "title": "Test Task",
        "description": "A test task",
        "priority": "HIGH",
        "effort": "LOW",
        "time_estimate_minutes": 30,
    }, headers=auth_headers)
    return response.get_json()


@pytest.fixture()
def sample_list(client, auth_headers):
    """Create and return a sample list."""
    response = client.post("/api/lists", json={
        "name": "Test List",
        "description": "A test list",
    }, headers=auth_headers)
    return response.get_json()
