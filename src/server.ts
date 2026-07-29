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

// Middleware
app.use(cors());
app.use(express.json());

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
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
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
