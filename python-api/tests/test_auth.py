"""Tests for authentication endpoints."""
import pytest


class TestRegister:
    """Tests for POST /api/auth/register."""

    def test_register_success(self, client):
        response = client.post("/api/auth/register", json={
            "username": "newuser",
            "email": "new@example.com",
            "password": "secure123",
        })
        assert response.status_code == 201
        data = response.get_json()
        assert "token" in data
        assert data["username"] == "newuser"
        assert data["userId"] is not None

    def test_register_missing_username(self, client):
        response = client.post("/api/auth/register", json={
            "email": "new@example.com",
            "password": "secure123",
        })
        assert response.status_code == 400
        assert "required" in response.get_json()["error"].lower()

    def test_register_missing_email(self, client):
        response = client.post("/api/auth/register", json={
            "username": "newuser",
            "password": "secure123",
        })
        assert response.status_code == 400

    def test_register_missing_password(self, client):
        response = client.post("/api/auth/register", json={
            "username": "newuser",
            "email": "new@example.com",
        })
        assert response.status_code == 400

    def test_register_short_password(self, client):
        response = client.post("/api/auth/register", json={
            "username": "newuser",
            "email": "new@example.com",
            "password": "short",
        })
        assert response.status_code == 400
        assert "6 characters" in response.get_json()["error"]

    def test_register_duplicate_username(self, client):
        client.post("/api/auth/register", json={
            "username": "newuser",
            "email": "first@example.com",
            "password": "secure123",
        })
        response = client.post("/api/auth/register", json={
            "username": "newuser",
            "email": "second@example.com",
            "password": "secure123",
        })
        assert response.status_code == 409
        assert "already exists" in response.get_json()["error"].lower()

    def test_register_duplicate_email(self, client):
        client.post("/api/auth/register", json={
            "username": "user1",
            "email": "same@example.com",
            "password": "secure123",
        })
        response = client.post("/api/auth/register", json={
            "username": "user2",
            "email": "same@example.com",
            "password": "secure123",
        })
        assert response.status_code == 409

    def test_register_empty_body(self, client):
        response = client.post("/api/auth/register", json={})
        assert response.status_code == 400


class TestLogin:
    """Tests for POST /api/auth/login."""

    def test_login_with_username(self, client):
        # Register first
        client.post("/api/auth/register", json={
            "username": "loginuser",
            "email": "login@example.com",
            "password": "secure123",
        })
        # Login with username
        response = client.post("/api/auth/login", json={
            "login": "loginuser",
            "password": "secure123",
        })
        assert response.status_code == 200
        data = response.get_json()
        assert "token" in data
        assert data["username"] == "loginuser"

    def test_login_with_email(self, client):
        client.post("/api/auth/register", json={
            "username": "loginuser",
            "email": "login@example.com",
            "password": "secure123",
        })
        response = client.post("/api/auth/login", json={
            "login": "login@example.com",
            "password": "secure123",
        })
        assert response.status_code == 200
        data = response.get_json()
        assert data["username"] == "loginuser"

    def test_login_missing_fields(self, client):
        response = client.post("/api/auth/login", json={})
        assert response.status_code == 400

    def test_login_missing_password(self, client):
        response = client.post("/api/auth/login", json={"login": "user"})
        assert response.status_code == 400

    def test_login_invalid_username(self, client):
        response = client.post("/api/auth/login", json={
            "login": "nonexistent",
            "password": "secure123",
        })
        assert response.status_code == 401
        assert "invalid" in response.get_json()["error"].lower()

    def test_login_wrong_password(self, client):
        client.post("/api/auth/register", json={
            "username": "loginuser",
            "email": "login@example.com",
            "password": "secure123",
        })
        response = client.post("/api/auth/login", json={
            "login": "loginuser",
            "password": "wrongpassword",
        })
        assert response.status_code == 401


class TestTokenValidation:
    """Tests for token-based authentication on protected routes."""

    def test_no_token_returns_401(self, client):
        response = client.get("/api/tasks")
        assert response.status_code == 401

    def test_invalid_token_returns_401(self, client):
        response = client.get("/api/tasks", headers={
            "Authorization": "Bearer invalid.token.here",
        })
        assert response.status_code == 401

    def test_malformed_auth_header_returns_401(self, client):
        response = client.get("/api/tasks", headers={
            "Authorization": "NotBearer sometoken",
        })
        assert response.status_code == 401

    def test_valid_token_grants_access(self, client, auth_headers):
        response = client.get("/api/tasks", headers=auth_headers)
        assert response.status_code == 200
