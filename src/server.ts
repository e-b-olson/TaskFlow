import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { initializeDatabase } from "./database";
import authRoutes from "./routes/auth";
import taskRoutes from "./routes/tasks";
import listRoutes from "./routes/lists";
import smartListRoutes from "./routes/smart-list";

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/+$/, "");
const publicDir = path.join(__dirname, "..", "public");

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(publicDir));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/lists", listRoutes);
app.use("/api/smart-list", smartListRoutes);

// SPA fallback - serve index.html for non-API routes
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) return;

  // If it looks like a static file request (has extension), 404
  if (path.extname(req.path)) {
    return res.status(404).send("Not found");
  }

  // Determine base path from X-Forwarded-Prefix header or env
  const prefix = (req.headers["x-forwarded-prefix"] as string) || BASE_PATH || "";
  const basePath = prefix.replace(/\/+$/, "");

  // Read index.html and replace the placeholder with the actual base path
  const indexPath = path.join(publicDir, "index.html");
  let html = fs.readFileSync(indexPath, "utf-8");
  html = html.replace(/__BASE_PATH__/g, basePath);
  res.type("html").send(html);
});

// Initialize database and start server
async function start() {
  await initializeDatabase();
  console.log("Database initialized");

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

export default app;
