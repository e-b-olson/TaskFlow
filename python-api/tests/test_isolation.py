"""Tests for data isolation between users."""
import pytest


class TestUserIsolation:
    """Verify that users cannot access each other's data."""

    def test_cannot_see_other_users_tasks(self, client, auth_headers, second_user_headers):
        # User 1 creates a task
        client.post("/api/tasks", json={"title": "Secret Task"}, headers=auth_headers)

        # User 2 lists tasks - should be empty
        response = client.get("/api/tasks", headers=second_user_headers)
        tasks = response.get_json()
        assert len(tasks) == 0

    def test_cannot_get_other_users_task_by_id(self, client, auth_headers, second_user_headers):
        resp = client.post("/api/tasks", json={"title": "Private"}, headers=auth_headers)
        task_id = resp.get_json()["id"]

        response = client.get(f"/api/tasks/{task_id}", headers=second_user_headers)
        assert response.status_code == 404

    def test_cannot_update_other_users_task(self, client, auth_headers, second_user_headers):
        resp = client.post("/api/tasks", json={"title": "Mine"}, headers=auth_headers)
        task_id = resp.get_json()["id"]

        response = client.put(f"/api/tasks/{task_id}", json={
            "title": "Hacked",
        }, headers=second_user_headers)
        assert response.status_code == 404

        # Verify unchanged
        response = client.get(f"/api/tasks/{task_id}", headers=auth_headers)
        assert response.get_json()["title"] == "Mine"

    def test_cannot_delete_other_users_task(self, client, auth_headers, second_user_headers):
        resp = client.post("/api/tasks", json={"title": "Protected"}, headers=auth_headers)
        task_id = resp.get_json()["id"]

        response = client.delete(f"/api/tasks/{task_id}", headers=second_user_headers)
        assert response.status_code == 404

        # Verify still exists
        response = client.get(f"/api/tasks/{task_id}", headers=auth_headers)
        assert response.status_code == 200

    def test_cannot_clone_other_users_task(self, client, auth_headers, second_user_headers):
        resp = client.post("/api/tasks", json={"title": "Original"}, headers=auth_headers)
        task_id = resp.get_json()["id"]

        response = client.post(f"/api/tasks/{task_id}/clone", headers=second_user_headers)
        assert response.status_code == 404

    def test_cannot_see_other_users_lists(self, client, auth_headers, second_user_headers):
        client.post("/api/lists", json={"name": "Secret List"}, headers=auth_headers)

        response = client.get("/api/lists", headers=second_user_headers)
        lists = response.get_json()
        assert len(lists) == 0

    def test_cannot_get_other_users_list_by_id(self, client, auth_headers, second_user_headers):
        resp = client.post("/api/lists", json={"name": "Private"}, headers=auth_headers)
        list_id = resp.get_json()["id"]

        response = client.get(f"/api/lists/{list_id}", headers=second_user_headers)
        assert response.status_code == 404

    def test_cannot_update_other_users_list(self, client, auth_headers, second_user_headers):
        resp = client.post("/api/lists", json={"name": "My List"}, headers=auth_headers)
        list_id = resp.get_json()["id"]

        response = client.put(f"/api/lists/{list_id}", json={
            "name": "Stolen",
        }, headers=second_user_headers)
        assert response.status_code == 404

    def test_cannot_delete_other_users_list(self, client, auth_headers, second_user_headers):
        resp = client.post("/api/lists", json={"name": "My List"}, headers=auth_headers)
        list_id = resp.get_json()["id"]

        response = client.delete(f"/api/lists/{list_id}", headers=second_user_headers)
        assert response.status_code == 404

        # Verify still exists
        response = client.get(f"/api/lists/{list_id}", headers=auth_headers)
        assert response.status_code == 200

    def test_cannot_add_task_to_other_users_list(self, client, auth_headers, second_user_headers):
        # User 1 creates list, User 2 creates task
        list_resp = client.post("/api/lists", json={"name": "My List"}, headers=auth_headers)
        list_id = list_resp.get_json()["id"]

        task_resp = client.post("/api/tasks", json={"title": "Their Task"}, headers=second_user_headers)
        task_id = task_resp.get_json()["id"]

        # User 2 tries to add their task to User 1's list
        response = client.post(f"/api/lists/{list_id}/tasks", json={
            "task_id": task_id,
        }, headers=second_user_headers)
        assert response.status_code == 404

    def test_smart_list_only_sees_own_tasks(self, client, auth_headers, second_user_headers):
        # Both users create tasks
        client.post("/api/tasks", json={
            "title": "User1 Task", "time_estimate_minutes": 15,
        }, headers=auth_headers)
        client.post("/api/tasks", json={
            "title": "User2 Task", "time_estimate_minutes": 15,
        }, headers=second_user_headers)

        # User 1 generates smart list
        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
        }, headers=auth_headers)
        data = response.get_json()
        titles = [t["title"] for t in data["tasks"]]
        assert "User1 Task" in titles
        assert "User2 Task" not in titles

        # User 2 generates smart list
        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
        }, headers=second_user_headers)
        data = response.get_json()
        titles = [t["title"] for t in data["tasks"]]
        assert "User2 Task" in titles
        assert "User1 Task" not in titles
