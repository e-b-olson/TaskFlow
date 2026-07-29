"""Tests for task CRUD endpoints."""
import pytest


class TestCreateTask:
    """Tests for POST /api/tasks."""

    def test_create_minimal_task(self, client, auth_headers):
        response = client.post("/api/tasks", json={
            "title": "Buy groceries",
        }, headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["title"] == "Buy groceries"
        assert data["status"] == "PENDING"
        assert data["priority"] == "MEDIUM"
        assert data["effort"] == "MEDIUM"
        assert data["description"] is None

    def test_create_full_task(self, client, auth_headers):
        response = client.post("/api/tasks", json={
            "title": "Full task",
            "description": "All fields",
            "status": "PENDING",
            "priority": "HIGH",
            "effort": "LOW",
            "deadline": "2026-12-31T23:59:59",
            "time_estimate_minutes": 45,
            "cost": 19.99,
            "materials": "Hammer, nails",
        }, headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["title"] == "Full task"
        assert data["description"] == "All fields"
        assert data["priority"] == "HIGH"
        assert data["effort"] == "LOW"
        assert data["time_estimate_minutes"] == 45
        assert data["cost"] == pytest.approx(19.99, rel=0.01)
        assert data["materials"] == "Hammer, nails"

    def test_create_task_missing_title(self, client, auth_headers):
        response = client.post("/api/tasks", json={
            "description": "No title",
        }, headers=auth_headers)
        assert response.status_code == 400
        assert "title" in response.get_json()["error"].lower()

    def test_create_task_unauthenticated(self, client):
        response = client.post("/api/tasks", json={"title": "Test"})
        assert response.status_code == 401


class TestGetTasks:
    """Tests for GET /api/tasks."""

    def test_get_empty_tasks(self, client, auth_headers):
        response = client.get("/api/tasks", headers=auth_headers)
        assert response.status_code == 200
        assert response.get_json() == []

    def test_get_tasks_returns_user_tasks(self, client, auth_headers):
        client.post("/api/tasks", json={"title": "Task 1"}, headers=auth_headers)
        client.post("/api/tasks", json={"title": "Task 2"}, headers=auth_headers)

        response = client.get("/api/tasks", headers=auth_headers)
        assert response.status_code == 200
        tasks = response.get_json()
        assert len(tasks) == 2

    def test_get_tasks_isolation(self, client, auth_headers, second_user_headers):
        """User cannot see another user's tasks."""
        client.post("/api/tasks", json={"title": "My task"}, headers=auth_headers)
        client.post("/api/tasks", json={"title": "Their task"}, headers=second_user_headers)

        response = client.get("/api/tasks", headers=auth_headers)
        tasks = response.get_json()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "My task"

    def test_filter_by_status(self, client, auth_headers):
        client.post("/api/tasks", json={"title": "Pending", "status": "PENDING"}, headers=auth_headers)
        client.post("/api/tasks", json={"title": "In Progress", "status": "IN_PROGRESS"}, headers=auth_headers)

        response = client.get("/api/tasks?status=PENDING", headers=auth_headers)
        tasks = response.get_json()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "Pending"

    def test_filter_by_priority(self, client, auth_headers):
        client.post("/api/tasks", json={"title": "High", "priority": "HIGH"}, headers=auth_headers)
        client.post("/api/tasks", json={"title": "Low", "priority": "LOW"}, headers=auth_headers)

        response = client.get("/api/tasks?priority=HIGH", headers=auth_headers)
        tasks = response.get_json()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "High"

    def test_filter_by_effort(self, client, auth_headers):
        client.post("/api/tasks", json={"title": "High effort", "effort": "HIGH"}, headers=auth_headers)
        client.post("/api/tasks", json={"title": "Low effort", "effort": "LOW"}, headers=auth_headers)

        response = client.get("/api/tasks?effort=LOW", headers=auth_headers)
        tasks = response.get_json()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "Low effort"

    def test_search_by_title(self, client, auth_headers):
        client.post("/api/tasks", json={"title": "Buy milk"}, headers=auth_headers)
        client.post("/api/tasks", json={"title": "Clean house"}, headers=auth_headers)

        response = client.get("/api/tasks?search=milk", headers=auth_headers)
        tasks = response.get_json()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "Buy milk"

    def test_search_by_description(self, client, auth_headers):
        client.post("/api/tasks", json={
            "title": "Task",
            "description": "Need to buy apples",
        }, headers=auth_headers)
        client.post("/api/tasks", json={
            "title": "Other",
            "description": "Clean the garage",
        }, headers=auth_headers)

        response = client.get("/api/tasks?search=apples", headers=auth_headers)
        tasks = response.get_json()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "Task"

    def test_sort_by_title_asc(self, client, auth_headers):
        client.post("/api/tasks", json={"title": "Zebra"}, headers=auth_headers)
        client.post("/api/tasks", json={"title": "Apple"}, headers=auth_headers)

        response = client.get("/api/tasks?sort_by=title&sort_order=asc", headers=auth_headers)
        tasks = response.get_json()
        assert tasks[0]["title"] == "Apple"
        assert tasks[1]["title"] == "Zebra"

    def test_sort_by_priority(self, client, auth_headers):
        client.post("/api/tasks", json={"title": "Low", "priority": "LOW"}, headers=auth_headers)
        client.post("/api/tasks", json={"title": "High", "priority": "HIGH"}, headers=auth_headers)

        response = client.get("/api/tasks?sort_by=priority&sort_order=asc", headers=auth_headers)
        tasks = response.get_json()
        # PostgreSQL sorts text alphabetically: HIGH < LOW < MEDIUM
        assert tasks[0]["priority"] == "HIGH"


class TestGetSingleTask:
    """Tests for GET /api/tasks/:id."""

    def test_get_task_success(self, client, auth_headers, sample_task):
        response = client.get(f"/api/tasks/{sample_task['id']}", headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["title"] == "Test Task"
        assert data["id"] == sample_task["id"]

    def test_get_task_not_found(self, client, auth_headers):
        response = client.get("/api/tasks/99999", headers=auth_headers)
        assert response.status_code == 404

    def test_get_task_other_user(self, client, auth_headers, second_user_headers):
        """Cannot get another user's task."""
        resp = client.post("/api/tasks", json={"title": "Private"}, headers=auth_headers)
        task_id = resp.get_json()["id"]

        response = client.get(f"/api/tasks/{task_id}", headers=second_user_headers)
        assert response.status_code == 404


class TestUpdateTask:
    """Tests for PUT /api/tasks/:id."""

    def test_partial_update(self, client, auth_headers, sample_task):
        response = client.put(f"/api/tasks/{sample_task['id']}", json={
            "title": "Updated Title",
        }, headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["title"] == "Updated Title"
        # Other fields unchanged
        assert data["priority"] == "HIGH"

    def test_full_update(self, client, auth_headers, sample_task):
        response = client.put(f"/api/tasks/{sample_task['id']}", json={
            "title": "New Title",
            "description": "New desc",
            "status": "IN_PROGRESS",
            "priority": "LOW",
            "effort": "HIGH",
            "time_estimate_minutes": 60,
            "cost": 25.0,
            "materials": "New materials",
        }, headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["title"] == "New Title"
        assert data["priority"] == "LOW"
        assert data["status"] == "IN_PROGRESS"

    def test_status_to_in_progress_sets_started_at(self, client, auth_headers, sample_task):
        response = client.put(f"/api/tasks/{sample_task['id']}", json={
            "status": "IN_PROGRESS",
        }, headers=auth_headers)
        data = response.get_json()
        assert data["started_at"] is not None

    def test_status_to_complete_sets_completed_at(self, client, auth_headers, sample_task):
        response = client.put(f"/api/tasks/{sample_task['id']}", json={
            "status": "COMPLETE",
        }, headers=auth_headers)
        data = response.get_json()
        assert data["completed_at"] is not None

    def test_status_back_to_pending_clears_started_at(self, client, auth_headers, sample_task):
        # First move to IN_PROGRESS
        client.put(f"/api/tasks/{sample_task['id']}", json={
            "status": "IN_PROGRESS",
        }, headers=auth_headers)
        # Then back to PENDING
        response = client.put(f"/api/tasks/{sample_task['id']}", json={
            "status": "PENDING",
        }, headers=auth_headers)
        data = response.get_json()
        assert data["started_at"] is None

    def test_update_not_found(self, client, auth_headers):
        response = client.put("/api/tasks/99999", json={
            "title": "Nope",
        }, headers=auth_headers)
        assert response.status_code == 404

    def test_update_other_user_task(self, client, auth_headers, second_user_headers):
        resp = client.post("/api/tasks", json={"title": "Mine"}, headers=auth_headers)
        task_id = resp.get_json()["id"]

        response = client.put(f"/api/tasks/{task_id}", json={
            "title": "Stolen",
        }, headers=second_user_headers)
        assert response.status_code == 404


class TestCloneTask:
    """Tests for POST /api/tasks/:id/clone."""

    def test_clone_success(self, client, auth_headers, sample_task):
        response = client.post(f"/api/tasks/{sample_task['id']}/clone", headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["title"] == "Test Task (copy)"
        assert data["status"] == "PENDING"
        assert data["id"] != sample_task["id"]

    def test_clone_preserves_fields(self, client, auth_headers, sample_task):
        response = client.post(f"/api/tasks/{sample_task['id']}/clone", headers=auth_headers)
        data = response.get_json()
        assert data["priority"] == sample_task["priority"]
        assert data["effort"] == sample_task["effort"]
        assert data["time_estimate_minutes"] == sample_task["time_estimate_minutes"]

    def test_clone_not_found(self, client, auth_headers):
        response = client.post("/api/tasks/99999/clone", headers=auth_headers)
        assert response.status_code == 404

    def test_clone_other_user_task(self, client, auth_headers, second_user_headers):
        resp = client.post("/api/tasks", json={"title": "Mine"}, headers=auth_headers)
        task_id = resp.get_json()["id"]

        response = client.post(f"/api/tasks/{task_id}/clone", headers=second_user_headers)
        assert response.status_code == 404


class TestDeleteTask:
    """Tests for DELETE /api/tasks/:id."""

    def test_delete_success(self, client, auth_headers, sample_task):
        response = client.delete(f"/api/tasks/{sample_task['id']}", headers=auth_headers)
        assert response.status_code == 204

        # Verify it's gone
        response = client.get(f"/api/tasks/{sample_task['id']}", headers=auth_headers)
        assert response.status_code == 404

    def test_delete_not_found(self, client, auth_headers):
        response = client.delete("/api/tasks/99999", headers=auth_headers)
        assert response.status_code == 404

    def test_delete_other_user_task(self, client, auth_headers, second_user_headers):
        resp = client.post("/api/tasks", json={"title": "Mine"}, headers=auth_headers)
        task_id = resp.get_json()["id"]

        response = client.delete(f"/api/tasks/{task_id}", headers=second_user_headers)
        assert response.status_code == 404

        # Verify it still exists for the owner
        response = client.get(f"/api/tasks/{task_id}", headers=auth_headers)
        assert response.status_code == 200
