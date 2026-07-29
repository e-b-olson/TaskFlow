# Test Plan - ToDo Application

## Overview
This test plan covers the Python/Flask API backend. Both backends (TypeScript and Python) implement the same API contract, so these tests validate the shared behavior.

## Test Categories

### 1. Authentication (`test_auth.py`)
- **Registration**
  - Successful registration returns token, userId, username
  - Missing fields return 400
  - Password too short (< 6 chars) returns 400
  - Duplicate username returns 409
  - Duplicate email returns 409
- **Login**
  - Successful login with username returns token
  - Successful login with email returns token
  - Missing fields return 400
  - Invalid username/email returns 401
  - Wrong password returns 401
- **Token validation**
  - Valid token grants access to protected routes
  - Missing token returns 401
  - Invalid token returns 401
  - Expired token returns 401
  - Malformed Authorization header returns 401

### 2. Tasks CRUD (`test_tasks.py`)
- **Create task (POST /api/tasks)**
  - Minimal task (title only) succeeds with defaults
  - Full task with all fields succeeds
  - Missing title returns 400
  - Unauthenticated request returns 401
- **Get tasks (GET /api/tasks)**
  - Returns all user's tasks
  - Does not return other users' tasks
  - Filter by status works
  - Filter by priority works
  - Filter by effort works
  - Search by title works
  - Search by description works
  - Sort by various fields works
  - Sort order (asc/desc) works
- **Get single task (GET /api/tasks/:id)**
  - Returns task for owner
  - Returns 404 for non-existent task
  - Returns 404 for another user's task
- **Update task (PUT /api/tasks/:id)**
  - Partial update works (only changed fields)
  - Full update works
  - Status transition to IN_PROGRESS sets started_at
  - Status transition to COMPLETE sets completed_at
  - Status transition back to PENDING clears started_at
  - Returns 404 for non-existent task
- **Clone task (POST /api/tasks/:id/clone)**
  - Creates copy with "(copy)" suffix
  - Clone has status PENDING regardless of original
  - Returns 404 for non-existent task
- **Delete task (DELETE /api/tasks/:id)**
  - Successful delete returns 204
  - Returns 404 for non-existent task
  - Cannot delete another user's task

### 3. Lists CRUD (`test_lists.py`)
- **Create list (POST /api/lists)**
  - Successful creation with name
  - Optional description works
  - Missing name returns 400
- **Get lists (GET /api/lists)**
  - Returns all user's lists
  - Does not return other users' lists
  - Ordered by created_at DESC
- **Get single list (GET /api/lists/:id)**
  - Returns list with tasks
  - Tasks ordered by position
  - Returns 404 for non-existent list
  - Returns 404 for another user's list
- **Update list (PUT /api/lists/:id)**
  - Update name works
  - Update description works
  - Returns 404 for non-existent list
- **Delete list (DELETE /api/lists/:id)**
  - Successful delete returns 204
  - Tasks are NOT deleted when list is deleted
  - Returns 404 for non-existent list
- **Add task to list (POST /api/lists/:id/tasks)**
  - Successfully adds task
  - Position auto-increments
  - Duplicate task returns 409
  - Non-existent list returns 404
  - Non-existent task returns 404
- **Remove task from list (DELETE /api/lists/:id/tasks/:taskId)**
  - Successfully removes task
  - Task still exists after removal
  - Returns 404 if task not on list
- **Reorder list (PUT /api/lists/:id/reorder)**
  - Successfully reorders tasks
  - Invalid input returns 400

### 4. Smart List Generation (`test_smart_list.py`)
- **Input validation**
  - Missing available_minutes returns 400
  - Zero/negative available_minutes returns 400
- **Task selection**
  - Selects tasks that fit within time budget
  - Higher priority tasks are preferred
  - Tasks with closer deadlines score higher
  - Completed tasks are excluded
  - Respects priority_filter
  - Respects effort_filter
  - Respects exclude_task_ids
- **List creation**
  - When list_name provided, creates list with selected tasks
  - Without list_name, returns suggestions only
  - Response includes total_estimated_minutes and remaining_minutes

### 5. Data Isolation (`test_isolation.py`)
- Users cannot see each other's tasks
- Users cannot see each other's lists
- Users cannot modify each other's tasks
- Users cannot modify each other's lists

### 6. UI / End-to-End Tests (`e2e/tests/`)
Tests run in a real browser via Playwright against the running app.

- **Authentication UI** (`auth.spec.ts`)
  - Login form shown by default
  - Switch between login/register forms
  - Successful registration enters app
  - Duplicate username shows error
  - Empty fields show client-side error
  - Login with username works
  - Invalid credentials show error
  - Logout returns to auth screen
  - Session persists on reload

- **Tasks UI** (`tasks.spec.ts`)
  - Empty state message
  - Create task via modal
  - Task card appears in list
  - Task detail view
  - Edit task from detail
  - Clone task
  - Delete task (with confirm dialog)
  - Filter by status/priority
  - Search tasks (with debounce)
  - Back navigation from detail

- **Lists UI** (`lists.spec.ts`)
  - Empty state message
  - Create list via modal
  - Create list with tasks pre-selected
  - View list tasks
  - Edit list name
  - Delete list from modal
  - Start/complete tasks within a list
  - Back navigation
  - Inline task creation from list modal

- **Smart Builder UI** (`smart-builder.spec.ts`)
  - Form displays correctly
  - No tasks shows appropriate message
  - Generates suggestions without creating list
  - Creates list when name provided
  - Priority filter works
  - Effort filter works
  - Time summary in results

- **Navigation UI** (`navigation.spec.ts`)
  - Default tab is My Lists
  - Tab switching
  - Hamburger menu open/close
  - Modal cancel buttons work

## Test Infrastructure

### API Tests (python-api/tests/)
- **Framework**: pytest
- **Database**: Isolated test PostgreSQL (port 5434) - never touches app data
- **Auth**: Helper functions to register users and generate tokens
- **Fixtures**: Shared setup for users, tasks, and lists
- **Safety**: Refuses to run if pointed at app database

### UI Tests (e2e/)
- **Framework**: Playwright
- **Browser**: Chromium (headless by default)
- **Target**: Running app instance (uses unique users per test for isolation)
- **No database cleanup needed**: Each test registers a fresh user
