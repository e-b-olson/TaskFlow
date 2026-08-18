# ToDo App

A full-featured task management application with smart list building, built with dual API backends (Node.js/Express and Python/Flask) sharing a PostgreSQL database.

## Features

- **User authentication** — Register/login with JWT-based sessions
- **Task management** — Create, edit, clone, and delete tasks with rich metadata (priority, effort, deadline, time estimates, cost, materials)
- **Filtering & sorting** — Filter tasks by status, priority, effort, deadline; full-text search; configurable sort order
- **Task lists** — Organize tasks into named lists with custom ordering
- **Smart list builder** — Automatically selects tasks to fill a given time budget using a scoring algorithm that considers priority, deadline urgency, and effort

## Architecture

```
┌────────────────────┐     ┌────────────────────┐
│  Node.js/Express   │     │   Python/Flask     │
│   (port 3000)      │     │   (port 5001)      │
│  + static frontend │     │  + static frontend │
└────────┬───────────┘     └────────┬───────────┘
         │                          │
         └──────────┬───────────────┘
                    │
         ┌──────────▼───────────┐
         │   PostgreSQL 16      │
         │   (port 5433)        │
         └──────────────────────┘
```

Both API servers are functionally identical and share the same database. JWT tokens are interchangeable between them.

## Tech Stack

| Layer | Node API | Python API |
|-------|----------|------------|
| Runtime | Node.js 20 | Python 3.12 |
| Framework | Express 4 | Flask 3 |
| Auth | jsonwebtoken + bcryptjs | PyJWT + bcrypt |
| Database | pg (node-postgres) | psycopg2 |
| Server | Node HTTP | Gunicorn |

**Database:** PostgreSQL 16 (Alpine)  
**Frontend:** Vanilla HTML/CSS/JS (served by either backend)

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### Run the app

```bash
docker compose up --build
```

This starts:
- **Node API + frontend** at http://localhost:3000
- **Python API + frontend** at http://localhost:5001
- **PostgreSQL** at localhost:5433

Both backends serve the same frontend and hit the same database, so you can use either URL.

### Run only specific services

```bash
# Just the Python API and database
docker compose up python-api db

# Just the Node API and database
docker compose up app db
```

### Data migration (from SQLite)

If migrating from a previous SQLite-based version:

```bash
docker compose --profile migration up migrate
```

## Testing

Tests run inside Docker against a dedicated test PostgreSQL database (port 5434), completely isolated from app data.

### Run all tests

```bash
docker compose -f docker-compose.test.yml run --rm --build api-tests
```

This will:
1. Start the test database container (if not already running)
2. Build the test image with your latest code
3. Run the full pytest suite and report results

### Start/stop the test database independently

```bash
# Start
docker compose -f docker-compose.test.yml up -d test-db

# Stop and remove
docker compose -f docker-compose.test.yml down
```

### Run end-to-end tests (Playwright)

```bash
docker compose -f docker-compose.test.yml run --rm --build e2e-tests
```

This starts the full stack (test DB, API, frontend) and runs Playwright browser tests against it.

## API Reference

All endpoints use JSON request/response bodies. Protected routes require an `Authorization: Bearer <token>` header.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account (username, email, password) |
| POST | `/api/auth/login` | Login (login, password) |

### Tasks (requires auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks (with filter/sort/search query params) |
| GET | `/api/tasks/:id` | Get single task |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| POST | `/api/tasks/:id/clone` | Clone task |
| DELETE | `/api/tasks/:id` | Delete task |

**Query parameters for GET /api/tasks:**
- `status` — PENDING, IN_PROGRESS, COMPLETE
- `priority` — HIGH, MEDIUM, LOW
- `effort` — HIGH, MEDIUM, LOW
- `sort_by` — title, status, created_at, deadline, priority, effort, cost, time_estimate_minutes
- `sort_order` — asc, desc
- `search` — full-text search on title/description
- `has_deadline` — true/false
- `deadline_before` / `deadline_after` — ISO date filter

### Lists (requires auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/lists` | Get all lists |
| GET | `/api/lists/:id` | Get list with tasks |
| POST | `/api/lists` | Create list |
| PUT | `/api/lists/:id` | Update list |
| DELETE | `/api/lists/:id` | Delete list |
| POST | `/api/lists/:id/tasks` | Add task to list |
| DELETE | `/api/lists/:id/tasks/:taskId` | Remove task from list |
| PUT | `/api/lists/:id/reorder` | Reorder tasks (body: `{ task_ids: [...] }`) |

### Smart List (requires auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/smart-list/generate` | Generate optimized task list |

**Request body:**
```json
{
  "available_minutes": 60,
  "list_name": "My Focus List",
  "priority_filter": "HIGH",
  "effort_filter": "LOW",
  "exclude_task_ids": [1, 2, 3]
}
```

## Database Schema

- **users** — id, username, email, password_hash, created_at
- **tasks** — id, user_id, title, description, status, created_at, started_at, completed_at, deadline, time_estimate_minutes, effort, priority, cost, materials
- **task_lists** — id, user_id, name, description, created_at
- **task_list_items** — id, task_list_id, task_id, position, added_at

## Project Structure

```
.
├── docker-compose.yml      # Orchestrates all services
├── Dockerfile              # Node.js API container
├── package.json
├── tsconfig.json
├── src/                    # Node.js/Express API (TypeScript)
│   ├── server.ts
│   ├── database.ts
│   ├── middleware/auth.ts
│   └── routes/
│       ├── auth.ts
│       ├── tasks.ts
│       ├── lists.ts
│       └── smart-list.ts
├── python-api/             # Python/Flask API
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── run.py
│   └── app/
│       ├── __init__.py
│       ├── database.py
│       ├── middleware.py
│       └── routes/
│           ├── auth.py
│           ├── tasks.py
│           ├── lists.py
│           └── smart_list.py
├── public/                 # Frontend (served by both backends)
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── scripts/
    └── migrate-data.js     # SQLite → PostgreSQL migration
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://todo_user:todo_pass@localhost:5432/todo_db` | PostgreSQL connection string |
| `JWT_SECRET` | `change-me-in-production` | Secret for signing JWT tokens |
| `PORT` | `3000` (Node) | Server port (Node API) |
| `STATIC_DIR` | `./public` | Path to frontend files (Python API) |

## Deploying to a VPS

This guide covers deploying the app on a fresh VPS (Ubuntu/Debian) using Docker Compose.

### 1. Server prerequisites

SSH into your VPS and install Docker:

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin (if not included)
sudo apt install docker-compose-plugin -y

# Log out and back in for group change to take effect
```

### 2. Clone the repo

```bash
git clone https://github.com/your-username/ToDo.git
cd ToDo
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with production values:

```dotenv
POSTGRES_USER=todo_user
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=todo_db
JWT_SECRET=<long-random-string>
```

Generate secure values with:

```bash
openssl rand -base64 32   # use output for JWT_SECRET
openssl rand -base64 24   # use output for POSTGRES_PASSWORD
```

### 4. Create a production Compose override

Create a `docker-compose.prod.yml` to tighten things up for production:

```yaml
services:
  app:
    environment:
      - NODE_ENV=production
    volumes: []            # don't mount source in prod
    restart: unless-stopped

  python-api:
    environment:
      - FLASK_ENV=production
    volumes: []
    restart: unless-stopped

  db:
    ports: []              # don't expose Postgres externally
    restart: unless-stopped
```

### 5. Start the app

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The app will be available at `http://<your-server-ip>:3000` (Node) and `http://<your-server-ip>:5001` (Python).

### 6. Set up a reverse proxy with HTTPS (recommended)

Use Nginx and Certbot to add TLS and proxy traffic on port 80/443 to your app.

Install Nginx:

```bash
sudo apt install nginx -y
```

Create `/etc/nginx/sites-available/todo`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and get a certificate:

```bash
sudo ln -s /etc/nginx/sites-available/todo /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Install Certbot and get a Let's Encrypt certificate
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

Certbot will auto-configure HTTPS and set up renewal.

### 7. Firewall

Allow only the ports you need:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 8. Maintenance

```bash
# View logs
docker compose logs -f

# Pull latest changes and redeploy
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Back up the database
docker compose exec db pg_dump -U todo_user todo_db > backup_$(date +%F).sql
```

## License

MIT
