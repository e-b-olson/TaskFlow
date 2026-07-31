import express from "express";
import cors from "cors";
import path from "path";
import { initializeDatabase } from "./database";
import authRoutes from "./routes/auth";
import taskRoutes from "./routes/tasks";
import listRoutes from "./routes/lists";
import smartListRoutes from "./routes/smart-list";

const app = express();
const PORT = process.env.PORT || 3000;

// Base path for reverse proxy subpath hosting (e.g. "/taskflow")
// Set via BASE_PATH env var or X-Forwarded-Prefix header
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/+$/, "");

// Middleware
app.use(cors());
app.use(express.json());

// Inject <base> tag into index.html so the frontend resolves assets and API calls correctly
function serveIndex(req: express.Request, res: express.Response) {
  const prefix = req.headers["x-forwarded-prefix"] as string || BASE_PATH || "";
  const basePath = prefix.replace(/\/+$/, "") + "/";
  const indexPath = path.join(__dirname, "..", "public", "index.html");

  if (basePath === "/") {
    return res.sendFile(indexPath);
  }

  // Read and inject <base href> tag
  const fs = require("fs");
  let html = fs.readFileSync(indexPath, "utf-8");
  html = html.replace("<head>", `<head>\n  <base href="${basePath}">`);
  res.type("html").send(html);
}

// Serve static frontend files
app.use(express.static(path.join(__dirname, "..", "public")));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/lists", listRoutes);
app.use("/api/smart-list", smartListRoutes);

// SPA fallback - serve index.html for non-API routes
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    serveIndex(req, res);
  }
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
