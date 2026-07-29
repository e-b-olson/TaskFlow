import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://todo_user:todo_pass@localhost:5432/todo_db",
});

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
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
  } finally {
    client.release();
  }
}

export default pool;
