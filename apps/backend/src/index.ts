import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
// import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/user/user.routes";

// Environment validation
// const requiredEnvVars = [
//   "DATABASE_URL",
//   "GITHUB_CLIENT_ID",
//   "GITHUB_CLIENT_SECRET",
//   "GITHUB_REDIRECT_URI",
// ] as const;

// for (const envVar of requiredEnvVars) {
//   if (!process.env[envVar]) {
//     throw new Error(`Missing required environment variable: ${envVar}`);
//   }
// }

const app = express();
const PORT = Number(process.env.PORT) || 4000;
// const NODE_ENV = process.env.NODE_ENV || "development";

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    credentials: true,
  })
);

// Request logging (development only)
// if (NODE_ENV === "development") {
//   app.use((req, _res, next) => {
//     console.log(`${req.method} ${req.path}`);
//     next();
//   });
// }

// Routes
// app.use("/auth", authRoutes);
app.use("/users", userRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    // environment: NODE_ENV,
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler
// app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
//   console.error("Error:", err);
//   res.status(500).json({
//     error: NODE_ENV === "production" ? "Internal server error" : err.message,
//   });
// });

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  // console.log(`📦 Environment: ${NODE_ENV}`);
});