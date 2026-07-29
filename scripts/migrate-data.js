/**
 * One-time migration script: SQLite → PostgreSQL
 *
 * Usage:
 *   1. Make sure Postgres is running (docker compose up db)
 *   2. Run: docker compose --profile migration run --rm migrate
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 *   SQLITE_PATH - Path to the SQLite database file
 */

const Database = require("better-sqlite3");
const { Pool } = require("pg");
const path = require("path");

const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, "..", "data", "todo.db");
const databaseUrl = process.env.DATABASE_URL || "postgresql://todo_user:todo_pass@localhost:5432/todo_db";

async function migrate() {
  console.log(`Reading from SQLite: ${sqlitePath}`);
  console.log(`Writing to PostgreSQL: ${databaseUrl}`);

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pg = new Pool({ connectionString: databaseUrl });

  const client = await pg.connect();

  try {
    await client.query("BEGIN");

    // Create tables if they don't exist
    await client.query(`
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

      CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
      CREATE INDEX IF NOT EXISTS idx_task_lists_user_id ON task_lists(user_id);
      CREATE INDEX IF NOT EXISTS idx_task_list_items_list ON task_list_items(task_list_id);
      CREATE INDEX IF NOT EXISTS idx_task_list_items_task ON task_list_items(task_id);
    `);
    console.log("Schema created.");

    // Migrate users
    const users = sqlite.prepare("SELECT * FROM users ORDER BY id").all();
    console.log(`Migrating ${users.length} users...`);

    for (const user of users) {
      await client.query(
        `INSERT INTO users (id, username, email, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.username, user.email, user.password_hash, user.created_at]
      );
    }

    if (users.length > 0) {
      await client.query("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))");
    }

    // Migrate tasks
    const tasks = sqlite.prepare("SELECT * FROM tasks ORDER BY id").all();
    console.log(`Migrating ${tasks.length} tasks...`);

    for (const task of tasks) {
      await client.query(
        `INSERT INTO tasks (id, user_id, title, description, status, created_at,
         started_at, completed_at, deadline, time_estimate_minutes, effort, priority, cost, materials)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO NOTHING`,
        [task.id, task.user_id, task.title, task.description, task.status,
         task.created_at, task.started_at, task.completed_at, task.deadline,
         task.time_estimate_minutes, task.effort, task.priority, task.cost, task.materials]
      );
    }

    if (tasks.length > 0) {
      await client.query("SELECT setval('tasks_id_seq', (SELECT MAX(id) FROM tasks))");
    }

    // Migrate task_lists
    const lists = sqlite.prepare("SELECT * FROM task_lists ORDER BY id").all();
    console.log(`Migrating ${lists.length} task lists...`);

    for (const list of lists) {
      await client.query(
        `INSERT INTO task_lists (id, user_id, name, description, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [list.id, list.user_id, list.name, list.description, list.created_at]
      );
    }

    if (lists.length > 0) {
      await client.query("SELECT setval('task_lists_id_seq', (SELECT MAX(id) FROM task_lists))");
    }

    // Migrate task_list_items
    const items = sqlite.prepare("SELECT * FROM task_list_items ORDER BY id").all();
    console.log(`Migrating ${items.length} task list items...`);

    for (const item of items) {
      await client.query(
        `INSERT INTO task_list_items (id, task_list_id, task_id, position, added_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [item.id, item.task_list_id, item.task_id, item.position, item.added_at]
      );
    }

    if (items.length > 0) {
      await client.query("SELECT setval('task_list_items_id_seq', (SELECT MAX(id) FROM task_list_items))");
    }

    await client.query("COMMIT");
    console.log("\nMigration complete!");
    console.log(`  Users: ${users.length}`);
    console.log(`  Tasks: ${tasks.length}`);
    console.log(`  Lists: ${lists.length}`);
    console.log(`  List items: ${items.length}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed, rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pg.end();
    sqlite.close();
  }
}

migrate();
