"""Tests for smart list generation endpoint."""
import pytest
from datetime import datetime, timedelta, timezone


class TestSmartListValidation:
    """Tests for input validation on POST /api/smart-list/generate."""

    def test_missing_available_minutes(self, client, auth_headers):
        response = client.post("/api/smart-list/generate", json={}, headers=auth_headers)
        assert response.status_code == 400
        assert "available_minutes" in response.get_json()["error"]

    def test_zero_available_minutes(self, client, auth_headers):
        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 0,
        }, headers=auth_headers)
        assert response.status_code == 400

    def test_negative_available_minutes(self, client, auth_headers):
        response = client.post("/api/smart-list/generate", json={
            "available_minutes": -10,
        }, headers=auth_headers)
        assert response.status_code == 400

    def test_unauthenticated(self, client):
        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
        })
        assert response.status_code == 401


class TestSmartListSelection:
    """Tests for task selection logic."""

    def test_no_tasks_returns_empty(self, client, auth_headers):
        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
        }, headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["tasks"] == []
        assert data["total_estimated_minutes"] == 0
        assert data["remaining_minutes"] == 60

    def test_selects_tasks_within_budget(self, client, auth_headers):
        # Create tasks with known time estimates
        client.post("/api/tasks", json={
            "title": "Short", "time_estimate_minutes": 15, "priority": "MEDIUM",
        }, headers=auth_headers)
        client.post("/api/tasks", json={
            "title": "Long", "time_estimate_minutes": 120, "priority": "MEDIUM",
        }, headers=auth_headers)

        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 30,
        }, headers=auth_headers)
        data = response.get_json()
        # Should only pick the short task
        assert len(data["tasks"]) == 1
        assert data["tasks"][0]["title"] == "Short"
        assert data["total_estimated_minutes"] == 15
        assert data["remaining_minutes"] == 15

    def test_prefers_higher_priority(self, client, auth_headers):
        client.post("/api/tasks", json={
            "title": "Low priority", "time_estimate_minutes": 20, "priority": "LOW",
        }, headers=auth_headers)
        client.post("/api/tasks", json={
            "title": "High priority", "time_estimate_minutes": 20, "priority": "HIGH",
        }, headers=auth_headers)

        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 25,
        }, headers=auth_headers)
        data = response.get_json()
        # Should pick high priority since only one fits
        assert len(data["tasks"]) == 1
        assert data["tasks"][0]["title"] == "High priority"

    def test_excludes_completed_tasks(self, client, auth_headers):
        resp = client.post("/api/tasks", json={
            "title": "Done task", "time_estimate_minutes": 15, "status": "COMPLETE",
        }, headers=auth_headers)
        client.post("/api/tasks", json={
            "title": "Pending task", "time_estimate_minutes": 15,
        }, headers=auth_headers)

        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
        }, headers=auth_headers)
        data = response.get_json()
        titles = [t["title"] for t in data["tasks"]]
        assert "Done task" not in titles
        assert "Pending task" in titles

    def test_priority_filter(self, client, auth_headers):
        client.post("/api/tasks", json={
            "title": "High", "time_estimate_minutes": 15, "priority": "HIGH",
        }, headers=auth_headers)
        client.post("/api/tasks", json={
            "title": "Low", "time_estimate_minutes": 15, "priority": "LOW",
        }, headers=auth_headers)

        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
            "priority_filter": "LOW",
        }, headers=auth_headers)
        data = response.get_json()
        assert len(data["tasks"]) == 1
        assert data["tasks"][0]["title"] == "Low"

    def test_effort_filter(self, client, auth_headers):
        client.post("/api/tasks", json={
            "title": "Hard", "time_estimate_minutes": 15, "effort": "HIGH",
        }, headers=auth_headers)
        client.post("/api/tasks", json={
            "title": "Easy", "time_estimate_minutes": 15, "effort": "LOW",
        }, headers=auth_headers)

        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
            "effort_filter": "LOW",
        }, headers=auth_headers)
        data = response.get_json()
        assert len(data["tasks"]) == 1
        assert data["tasks"][0]["title"] == "Easy"

    def test_exclude_task_ids(self, client, auth_headers):
        t1 = client.post("/api/tasks", json={
            "title": "Include me", "time_estimate_minutes": 15,
        }, headers=auth_headers).get_json()
        t2 = client.post("/api/tasks", json={
            "title": "Exclude me", "time_estimate_minutes": 15,
        }, headers=auth_headers).get_json()

        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
            "exclude_task_ids": [t2["id"]],
        }, headers=auth_headers)
        data = response.get_json()
        titles = [t["title"] for t in data["tasks"]]
        assert "Include me" in titles
        assert "Exclude me" not in titles

    def test_tasks_with_deadline_score_higher(self, client, auth_headers):
        """Tasks with imminent deadlines should be preferred."""
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        client.post("/api/tasks", json={
            "title": "No deadline", "time_estimate_minutes": 20, "priority": "LOW",
        }, headers=auth_headers)
        client.post("/api/tasks", json={
            "title": "Urgent", "time_estimate_minutes": 20, "priority": "LOW",
            "deadline": tomorrow,
        }, headers=auth_headers)

        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 25,
        }, headers=auth_headers)
        data = response.get_json()
        # Should prefer the one with deadline
        assert len(data["tasks"]) == 1
        assert data["tasks"][0]["title"] == "Urgent"


class TestSmartListCreation:
    """Tests for list creation when list_name is provided."""

    def test_creates_list_with_name(self, client, auth_headers):
        client.post("/api/tasks", json={
            "title": "Task A", "time_estimate_minutes": 15,
        }, headers=auth_headers)

        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
            "list_name": "My Smart List",
        }, headers=auth_headers)
        assert response.status_code == 201
        data = response.get_json()
        assert data["list"]["name"] == "My Smart List"
        assert len(data["tasks"]) == 1

        # Verify list actually exists
        list_id = data["list"]["id"]
        list_resp = client.get(f"/api/lists/{list_id}", headers=auth_headers)
        assert list_resp.status_code == 200
        assert list_resp.get_json()["name"] == "My Smart List"

    def test_without_list_name_returns_suggestions_only(self, client, auth_headers):
        client.post("/api/tasks", json={
            "title": "Task A", "time_estimate_minutes": 15,
        }, headers=auth_headers)

        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
        }, headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert "list" not in data
        assert "tasks" in data

    def test_response_includes_time_summary(self, client, auth_headers):
        client.post("/api/tasks", json={
            "title": "Task A", "time_estimate_minutes": 20,
        }, headers=auth_headers)
        client.post("/api/tasks", json={
            "title": "Task B", "time_estimate_minutes": 25,
        }, headers=auth_headers)

        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
        }, headers=auth_headers)
        data = response.get_json()
        assert data["total_estimated_minutes"] == 45
        assert data["remaining_minutes"] == 15

    def test_user_isolation(self, client, auth_headers, second_user_headers):
        """Smart list only considers the requesting user's tasks."""
        client.post("/api/tasks", json={
            "title": "My Task", "time_estimate_minutes": 15,
        }, headers=auth_headers)
        client.post("/api/tasks", json={
            "title": "Their Task", "time_estimate_minutes": 15,
        }, headers=second_user_headers)

        response = client.post("/api/smart-list/generate", json={
            "available_minutes": 60,
        }, headers=auth_headers)
        data = response.get_json()
        titles = [t["title"] for t in data["tasks"]]
        assert "My Task" in titles
        assert "Their Task" not in titles
