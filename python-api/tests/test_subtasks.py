"""Tests for sub-task functionality."""
import pytest


class TestCreateSubTask:
    """Tests for creating tasks with parent_task_id."""

    def test_create_subtask(self, client, auth_headers, sample_task):
        """A task can be created as a sub-task of another task."""
        response = client.post("/api/tasks", json={
            "title": "Sub-task 1",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["title"] == "Sub-task 1"
        assert data["parent_task_id"] == sample_task["id"]

    def test_create_subtask_inherits_defaults(self, client, auth_headers, sample_task):
        """A sub-task has the same defaults as a regular task."""
        response = client.post("/api/tasks", json={
            "title": "Sub-task",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        data = response.get_json()
        assert data["status"] == "PENDING"
        assert data["priority"] == "MEDIUM"
        assert data["effort"] == "MEDIUM"

    def test_create_subtask_with_all_fields(self, client, auth_headers, sample_task):
        """A sub-task supports all the same fields as a regular task."""
        response = client.post("/api/tasks", json={
            "title": "Full sub-task",
            "description": "Detailed sub-task",
            "parent_task_id": sample_task["id"],
            "priority": "HIGH",
            "effort": "LOW",
            "time_estimate_minutes": 15,
            "cost": 5.50,
            "materials": "Glue",
        }, headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["priority"] == "HIGH"
        assert data["effort"] == "LOW"
        assert data["time_estimate_minutes"] == 15
        assert data["cost"] == pytest.approx(5.50, rel=0.01)
        assert data["materials"] == "Glue"

    def test_create_subtask_invalid_parent(self, client, auth_headers):
        """Creating a sub-task with a non-existent parent returns 404."""
        response = client.post("/api/tasks", json={
            "title": "Orphan",
            "parent_task_id": 99999,
        }, headers=auth_headers)
        assert response.status_code == 404
        assert "parent" in response.get_json()["error"].lower()

    def test_create_subtask_other_users_parent(self, client, auth_headers, second_user_headers):
        """Cannot create a sub-task under another user's task."""
        resp = client.post("/api/tasks", json={"title": "Their task"}, headers=second_user_headers)
        other_task_id = resp.get_json()["id"]

        response = client.post("/api/tasks", json={
            "title": "My subtask",
            "parent_task_id": other_task_id,
        }, headers=auth_headers)
        assert response.status_code == 404

    def test_create_nested_subtask(self, client, auth_headers, sample_task):
        """A sub-task can itself have sub-tasks (nested hierarchy)."""
        # Create a sub-task
        resp = client.post("/api/tasks", json={
            "title": "Sub-task",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        subtask = resp.get_json()

        # Create a sub-sub-task
        response = client.post("/api/tasks", json={
            "title": "Sub-sub-task",
            "parent_task_id": subtask["id"],
        }, headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["parent_task_id"] == subtask["id"]

    def test_top_level_task_has_null_parent(self, client, auth_headers):
        """A regular task has parent_task_id = None."""
        response = client.post("/api/tasks", json={
            "title": "Regular task",
        }, headers=auth_headers)
        data = response.get_json()
        assert data["parent_task_id"] is None


class TestSubTaskVisibility:
    """Tests that sub-tasks don't appear in the All Tasks listing."""

    def test_subtasks_hidden_from_task_list(self, client, auth_headers, sample_task):
        """Sub-tasks do not appear in the GET /api/tasks listing."""
        client.post("/api/tasks", json={
            "title": "Sub-task A",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        client.post("/api/tasks", json={
            "title": "Sub-task B",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)

        response = client.get("/api/tasks", headers=auth_headers)
        tasks = response.get_json()
        # Only the parent task should appear
        assert len(tasks) == 1
        assert tasks[0]["id"] == sample_task["id"]

    def test_subtask_accessible_by_id(self, client, auth_headers, sample_task):
        """A sub-task can still be fetched directly by ID."""
        resp = client.post("/api/tasks", json={
            "title": "Sub-task",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        subtask = resp.get_json()

        response = client.get(f"/api/tasks/{subtask['id']}", headers=auth_headers)
        assert response.status_code == 200
        assert response.get_json()["title"] == "Sub-task"

    def test_nested_subtasks_all_hidden(self, client, auth_headers, sample_task):
        """Deeply nested sub-tasks are all hidden from the listing."""
        # Create a chain: sample_task -> sub1 -> sub2
        resp = client.post("/api/tasks", json={
            "title": "Sub-1",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        sub1 = resp.get_json()

        client.post("/api/tasks", json={
            "title": "Sub-2",
            "parent_task_id": sub1["id"],
        }, headers=auth_headers)

        response = client.get("/api/tasks", headers=auth_headers)
        tasks = response.get_json()
        assert len(tasks) == 1
        assert tasks[0]["id"] == sample_task["id"]


class TestSubTaskCycleDetection:
    """Tests that inheritance loops are prevented."""

    def test_task_cannot_be_its_own_parent(self, client, auth_headers, sample_task):
        """A task cannot be set as its own parent."""
        response = client.put(f"/api/tasks/{sample_task['id']}", json={
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        assert response.status_code == 400
        assert "cycle" in response.get_json()["error"].lower()

    def test_direct_cycle_two_tasks(self, client, auth_headers):
        """A -> B -> A cycle is rejected."""
        # Create A and B where B is a sub-task of A
        resp_a = client.post("/api/tasks", json={"title": "Task A"}, headers=auth_headers)
        task_a = resp_a.get_json()

        resp_b = client.post("/api/tasks", json={
            "title": "Task B",
            "parent_task_id": task_a["id"],
        }, headers=auth_headers)
        task_b = resp_b.get_json()

        # Try to make A a sub-task of B (would create A -> B -> A)
        response = client.put(f"/api/tasks/{task_a['id']}", json={
            "parent_task_id": task_b["id"],
        }, headers=auth_headers)
        assert response.status_code == 400
        assert "cycle" in response.get_json()["error"].lower()

    def test_indirect_cycle_three_tasks(self, client, auth_headers):
        """A -> B -> C -> A cycle is rejected."""
        resp_a = client.post("/api/tasks", json={"title": "Task A"}, headers=auth_headers)
        task_a = resp_a.get_json()

        resp_b = client.post("/api/tasks", json={
            "title": "Task B",
            "parent_task_id": task_a["id"],
        }, headers=auth_headers)
        task_b = resp_b.get_json()

        resp_c = client.post("/api/tasks", json={
            "title": "Task C",
            "parent_task_id": task_b["id"],
        }, headers=auth_headers)
        task_c = resp_c.get_json()

        # Try to make A a sub-task of C (would create A -> B -> C -> A)
        response = client.put(f"/api/tasks/{task_a['id']}", json={
            "parent_task_id": task_c["id"],
        }, headers=auth_headers)
        assert response.status_code == 400
        assert "cycle" in response.get_json()["error"].lower()

    def test_reparent_to_descendant_rejected(self, client, auth_headers):
        """Moving a task under one of its own descendants is rejected."""
        resp_a = client.post("/api/tasks", json={"title": "Task A"}, headers=auth_headers)
        task_a = resp_a.get_json()

        resp_b = client.post("/api/tasks", json={
            "title": "Task B",
            "parent_task_id": task_a["id"],
        }, headers=auth_headers)
        task_b = resp_b.get_json()

        resp_c = client.post("/api/tasks", json={
            "title": "Task C",
            "parent_task_id": task_b["id"],
        }, headers=auth_headers)
        task_c = resp_c.get_json()

        # Try to make B a sub-task of C (B is C's ancestor)
        response = client.put(f"/api/tasks/{task_b['id']}", json={
            "parent_task_id": task_c["id"],
        }, headers=auth_headers)
        assert response.status_code == 400
        assert "cycle" in response.get_json()["error"].lower()

    def test_valid_reparent_no_cycle(self, client, auth_headers):
        """Reparenting to a non-ancestor/non-descendant is allowed."""
        resp_a = client.post("/api/tasks", json={"title": "Task A"}, headers=auth_headers)
        task_a = resp_a.get_json()

        resp_b = client.post("/api/tasks", json={"title": "Task B"}, headers=auth_headers)
        task_b = resp_b.get_json()

        resp_c = client.post("/api/tasks", json={
            "title": "Task C",
            "parent_task_id": task_a["id"],
        }, headers=auth_headers)
        task_c = resp_c.get_json()

        # Move C under B (no cycle, A and B are siblings)
        response = client.put(f"/api/tasks/{task_c['id']}", json={
            "parent_task_id": task_b["id"],
        }, headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["parent_task_id"] == task_b["id"]

    def test_unparent_task(self, client, auth_headers, sample_task):
        """A sub-task can be unparented (moved to top level)."""
        resp = client.post("/api/tasks", json={
            "title": "Sub-task",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        subtask = resp.get_json()

        # Remove parent
        response = client.put(f"/api/tasks/{subtask['id']}", json={
            "parent_task_id": None,
        }, headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["parent_task_id"] is None

        # Now it should appear in the listing
        response = client.get("/api/tasks", headers=auth_headers)
        tasks = response.get_json()
        titles = [t["title"] for t in tasks]
        assert "Sub-task" in titles


class TestSubTaskCascadeDelete:
    """Tests that deleting a parent cascades to sub-tasks."""

    def test_delete_parent_deletes_subtasks(self, client, auth_headers, sample_task):
        """Deleting a parent task also deletes its sub-tasks."""
        resp = client.post("/api/tasks", json={
            "title": "Sub-task",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        subtask = resp.get_json()

        # Delete the parent
        response = client.delete(f"/api/tasks/{sample_task['id']}", headers=auth_headers)
        assert response.status_code == 204

        # Sub-task should be gone
        response = client.get(f"/api/tasks/{subtask['id']}", headers=auth_headers)
        assert response.status_code == 404

    def test_delete_parent_cascades_deeply(self, client, auth_headers, sample_task):
        """Cascade delete works through multiple levels."""
        resp = client.post("/api/tasks", json={
            "title": "Sub-1",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        sub1 = resp.get_json()

        resp = client.post("/api/tasks", json={
            "title": "Sub-2",
            "parent_task_id": sub1["id"],
        }, headers=auth_headers)
        sub2 = resp.get_json()

        # Delete root parent
        client.delete(f"/api/tasks/{sample_task['id']}", headers=auth_headers)

        # Both descendants should be gone
        assert client.get(f"/api/tasks/{sub1['id']}", headers=auth_headers).status_code == 404
        assert client.get(f"/api/tasks/{sub2['id']}", headers=auth_headers).status_code == 404

    def test_delete_subtask_leaves_parent(self, client, auth_headers, sample_task):
        """Deleting a sub-task does not affect its parent."""
        resp = client.post("/api/tasks", json={
            "title": "Sub-task",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        subtask = resp.get_json()

        client.delete(f"/api/tasks/{subtask['id']}", headers=auth_headers)

        # Parent still exists
        response = client.get(f"/api/tasks/{sample_task['id']}", headers=auth_headers)
        assert response.status_code == 200


class TestCloneSubTask:
    """Tests for cloning sub-tasks."""

    def test_clone_subtask_preserves_parent(self, client, auth_headers, sample_task):
        """Cloning a sub-task preserves the parent_task_id."""
        resp = client.post("/api/tasks", json={
            "title": "Sub-task",
            "parent_task_id": sample_task["id"],
        }, headers=auth_headers)
        subtask = resp.get_json()

        response = client.post(f"/api/tasks/{subtask['id']}/clone", headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["title"] == "Sub-task (copy)"
        assert data["parent_task_id"] == sample_task["id"]

    def test_clone_top_level_task_has_null_parent(self, client, auth_headers, sample_task):
        """Cloning a top-level task results in a clone with null parent."""
        response = client.post(f"/api/tasks/{sample_task['id']}/clone", headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["parent_task_id"] is None
