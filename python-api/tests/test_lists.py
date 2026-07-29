"""Tests for list CRUD endpoints."""
import pytest


class TestCreateList:
    """Tests for POST /api/lists."""

    def test_create_list_success(self, client, auth_headers):
        response = client.post("/api/lists", json={
            "name": "Shopping",
            "description": "Grocery shopping tasks",
        }, headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["name"] == "Shopping"
        assert data["description"] == "Grocery shopping tasks"
        assert "id" in data
        assert "created_at" in data

    def test_create_list_name_only(self, client, auth_headers):
        response = client.post("/api/lists", json={
            "name": "Simple List",
        }, headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["name"] == "Simple List"
        assert data["description"] is None

    def test_create_list_missing_name(self, client, auth_headers):
        response = client.post("/api/lists", json={
            "description": "No name",
        }, headers=auth_headers)
        assert response.status_code == 400
        assert "name" in response.get_json()["error"].lower()

    def test_create_list_unauthenticated(self, client):
        response = client.post("/api/lists", json={"name": "Test"})
        assert response.status_code == 401


class TestGetLists:
    """Tests for GET /api/lists."""

    def test_get_empty_lists(self, client, auth_headers):
        response = client.get("/api/lists", headers=auth_headers)
        assert response.status_code == 200
        assert response.get_json() == []

    def test_get_lists_returns_user_lists(self, client, auth_headers):
        client.post("/api/lists", json={"name": "List 1"}, headers=auth_headers)
        client.post("/api/lists", json={"name": "List 2"}, headers=auth_headers)

        response = client.get("/api/lists", headers=auth_headers)
        lists = response.get_json()
        assert len(lists) == 2

    def test_get_lists_ordered_by_created_at_desc(self, client, auth_headers):
        client.post("/api/lists", json={"name": "First"}, headers=auth_headers)
        client.post("/api/lists", json={"name": "Second"}, headers=auth_headers)

        response = client.get("/api/lists", headers=auth_headers)
        lists = response.get_json()
        # Most recent first
        assert lists[0]["name"] == "Second"
        assert lists[1]["name"] == "First"

    def test_get_lists_isolation(self, client, auth_headers, second_user_headers):
        client.post("/api/lists", json={"name": "My List"}, headers=auth_headers)
        client.post("/api/lists", json={"name": "Their List"}, headers=second_user_headers)

        response = client.get("/api/lists", headers=auth_headers)
        lists = response.get_json()
        assert len(lists) == 1
        assert lists[0]["name"] == "My List"


class TestGetSingleList:
    """Tests for GET /api/lists/:id."""

    def test_get_list_success(self, client, auth_headers, sample_list):
        response = client.get(f"/api/lists/{sample_list['id']}", headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["name"] == "Test List"
        assert "tasks" in data
        assert isinstance(data["tasks"], list)

    def test_get_list_with_tasks(self, client, auth_headers, sample_list):
        # Create a task and add it
        task_resp = client.post("/api/tasks", json={"title": "In list"}, headers=auth_headers)
        task_id = task_resp.get_json()["id"]
        client.post(f"/api/lists/{sample_list['id']}/tasks", json={
            "task_id": task_id,
        }, headers=auth_headers)

        response = client.get(f"/api/lists/{sample_list['id']}", headers=auth_headers)
        data = response.get_json()
        assert len(data["tasks"]) == 1
        assert data["tasks"][0]["title"] == "In list"

    def test_get_list_tasks_ordered_by_position(self, client, auth_headers, sample_list):
        # Add multiple tasks
        task1 = client.post("/api/tasks", json={"title": "First"}, headers=auth_headers).get_json()
        task2 = client.post("/api/tasks", json={"title": "Second"}, headers=auth_headers).get_json()

        client.post(f"/api/lists/{sample_list['id']}/tasks", json={"task_id": task1["id"]}, headers=auth_headers)
        client.post(f"/api/lists/{sample_list['id']}/tasks", json={"task_id": task2["id"]}, headers=auth_headers)

        response = client.get(f"/api/lists/{sample_list['id']}", headers=auth_headers)
        tasks = response.get_json()["tasks"]
        assert tasks[0]["title"] == "First"
        assert tasks[1]["title"] == "Second"

    def test_get_list_not_found(self, client, auth_headers):
        response = client.get("/api/lists/99999", headers=auth_headers)
        assert response.status_code == 404

    def test_get_list_other_user(self, client, auth_headers, second_user_headers, sample_list):
        response = client.get(f"/api/lists/{sample_list['id']}", headers=second_user_headers)
        assert response.status_code == 404


class TestUpdateList:
    """Tests for PUT /api/lists/:id."""

    def test_update_name(self, client, auth_headers, sample_list):
        response = client.put(f"/api/lists/{sample_list['id']}", json={
            "name": "Updated Name",
        }, headers=auth_headers)
        assert response.status_code == 200
        assert response.get_json()["name"] == "Updated Name"

    def test_update_description(self, client, auth_headers, sample_list):
        response = client.put(f"/api/lists/{sample_list['id']}", json={
            "description": "New description",
        }, headers=auth_headers)
        assert response.status_code == 200
        assert response.get_json()["description"] == "New description"

    def test_update_list_not_found(self, client, auth_headers):
        response = client.put("/api/lists/99999", json={"name": "Nope"}, headers=auth_headers)
        assert response.status_code == 404

    def test_update_other_user_list(self, client, auth_headers, second_user_headers, sample_list):
        response = client.put(f"/api/lists/{sample_list['id']}", json={
            "name": "Stolen",
        }, headers=second_user_headers)
        assert response.status_code == 404


class TestDeleteList:
    """Tests for DELETE /api/lists/:id."""

    def test_delete_success(self, client, auth_headers, sample_list):
        response = client.delete(f"/api/lists/{sample_list['id']}", headers=auth_headers)
        assert response.status_code == 204

        # Verify it's gone
        response = client.get(f"/api/lists/{sample_list['id']}", headers=auth_headers)
        assert response.status_code == 404

    def test_delete_list_does_not_delete_tasks(self, client, auth_headers, sample_list):
        # Add task to list
        task_resp = client.post("/api/tasks", json={"title": "Survive"}, headers=auth_headers)
        task_id = task_resp.get_json()["id"]
        client.post(f"/api/lists/{sample_list['id']}/tasks", json={"task_id": task_id}, headers=auth_headers)

        # Delete the list
        client.delete(f"/api/lists/{sample_list['id']}", headers=auth_headers)

        # Task still exists
        response = client.get(f"/api/tasks/{task_id}", headers=auth_headers)
        assert response.status_code == 200

    def test_delete_not_found(self, client, auth_headers):
        response = client.delete("/api/lists/99999", headers=auth_headers)
        assert response.status_code == 404

    def test_delete_other_user_list(self, client, auth_headers, second_user_headers, sample_list):
        response = client.delete(f"/api/lists/{sample_list['id']}", headers=second_user_headers)
        assert response.status_code == 404


class TestAddTaskToList:
    """Tests for POST /api/lists/:id/tasks."""

    def test_add_task_success(self, client, auth_headers, sample_list, sample_task):
        response = client.post(f"/api/lists/{sample_list['id']}/tasks", json={
            "task_id": sample_task["id"],
        }, headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["position"] == 0

    def test_add_task_increments_position(self, client, auth_headers, sample_list):
        task1 = client.post("/api/tasks", json={"title": "T1"}, headers=auth_headers).get_json()
        task2 = client.post("/api/tasks", json={"title": "T2"}, headers=auth_headers).get_json()

        resp1 = client.post(f"/api/lists/{sample_list['id']}/tasks", json={"task_id": task1["id"]}, headers=auth_headers)
        resp2 = client.post(f"/api/lists/{sample_list['id']}/tasks", json={"task_id": task2["id"]}, headers=auth_headers)

        assert resp1.get_json()["position"] == 0
        assert resp2.get_json()["position"] == 1

    def test_add_duplicate_task_returns_409(self, client, auth_headers, sample_list, sample_task):
        client.post(f"/api/lists/{sample_list['id']}/tasks", json={
            "task_id": sample_task["id"],
        }, headers=auth_headers)

        response = client.post(f"/api/lists/{sample_list['id']}/tasks", json={
            "task_id": sample_task["id"],
        }, headers=auth_headers)
        assert response.status_code == 409

    def test_add_task_missing_task_id(self, client, auth_headers, sample_list):
        response = client.post(f"/api/lists/{sample_list['id']}/tasks", json={}, headers=auth_headers)
        assert response.status_code == 400

    def test_add_task_list_not_found(self, client, auth_headers, sample_task):
        response = client.post("/api/lists/99999/tasks", json={
            "task_id": sample_task["id"],
        }, headers=auth_headers)
        assert response.status_code == 404

    def test_add_task_task_not_found(self, client, auth_headers, sample_list):
        response = client.post(f"/api/lists/{sample_list['id']}/tasks", json={
            "task_id": 99999,
        }, headers=auth_headers)
        assert response.status_code == 404


class TestRemoveTaskFromList:
    """Tests for DELETE /api/lists/:id/tasks/:taskId."""

    def test_remove_task_success(self, client, auth_headers, sample_list, sample_task):
        client.post(f"/api/lists/{sample_list['id']}/tasks", json={
            "task_id": sample_task["id"],
        }, headers=auth_headers)

        response = client.delete(
            f"/api/lists/{sample_list['id']}/tasks/{sample_task['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 204

    def test_remove_task_still_exists(self, client, auth_headers, sample_list, sample_task):
        """Removing from list doesn't delete the task itself."""
        client.post(f"/api/lists/{sample_list['id']}/tasks", json={
            "task_id": sample_task["id"],
        }, headers=auth_headers)

        client.delete(
            f"/api/lists/{sample_list['id']}/tasks/{sample_task['id']}",
            headers=auth_headers,
        )

        # Task still exists
        response = client.get(f"/api/tasks/{sample_task['id']}", headers=auth_headers)
        assert response.status_code == 200

    def test_remove_task_not_on_list(self, client, auth_headers, sample_list, sample_task):
        response = client.delete(
            f"/api/lists/{sample_list['id']}/tasks/{sample_task['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_remove_task_list_not_found(self, client, auth_headers, sample_task):
        response = client.delete(
            f"/api/lists/99999/tasks/{sample_task['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestReorderList:
    """Tests for PUT /api/lists/:id/reorder."""

    def test_reorder_success(self, client, auth_headers, sample_list):
        task1 = client.post("/api/tasks", json={"title": "T1"}, headers=auth_headers).get_json()
        task2 = client.post("/api/tasks", json={"title": "T2"}, headers=auth_headers).get_json()
        task3 = client.post("/api/tasks", json={"title": "T3"}, headers=auth_headers).get_json()

        for t in [task1, task2, task3]:
            client.post(f"/api/lists/{sample_list['id']}/tasks", json={"task_id": t["id"]}, headers=auth_headers)

        # Reverse the order
        response = client.put(f"/api/lists/{sample_list['id']}/reorder", json={
            "task_ids": [task3["id"], task2["id"], task1["id"]],
        }, headers=auth_headers)
        assert response.status_code == 200

        # Verify new order
        list_resp = client.get(f"/api/lists/{sample_list['id']}", headers=auth_headers)
        tasks = list_resp.get_json()["tasks"]
        assert tasks[0]["title"] == "T3"
        assert tasks[1]["title"] == "T2"
        assert tasks[2]["title"] == "T1"

    def test_reorder_invalid_input(self, client, auth_headers, sample_list):
        response = client.put(f"/api/lists/{sample_list['id']}/reorder", json={
            "task_ids": "not-an-array",
        }, headers=auth_headers)
        assert response.status_code == 400

    def test_reorder_list_not_found(self, client, auth_headers):
        response = client.put("/api/lists/99999/reorder", json={
            "task_ids": [1, 2, 3],
        }, headers=auth_headers)
        assert response.status_code == 404
