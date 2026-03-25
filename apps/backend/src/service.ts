// import express from "express";
// import dotenv from "dotenv";
// import axios from "axios";
// import jwt from "jsonwebtoken";
// import cookieParser from "cookie-parser";
// import crypto from "crypto";
// import bcrypt from "bcryptjs";
// import cors from "cors";
// import { PrismaClient } from "@prisma/client";

// dotenv.config({ path: process.env.NODE_ENV === "production" ? ".env" : "./.env" });

// const prisma = new PrismaClient();
// const app = express();
// app.use(express.json());
// app.use(cookieParser());

// /* CORS */
// const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
// app.use(cors({
//   origin: FRONTEND_URL,
//   credentials: true,
// }));

// const PORT = process.env.PORT ?? 4000;
// const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
// const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
// const REDIRECT_URI = process.env.GITHUB_REDIRECT_URI!;
// const ACCESS_SECRET = process.env.JWT_ACCESS_TOKEN_SECRET!;
// const REFRESH_SECRET = process.env.JWT_REFRESH_TOKEN_SECRET!;
// const ACCESS_EXP = process.env.ACCESS_TOKEN_EXP ?? "15m";
// const REFRESH_EXP = process.env.REFRESH_TOKEN_EXP ?? "30d";

// /* Utility: hash refresh token before storing */
// async function hashToken(t: string) {
//   const salt = await bcrypt.genSalt(10);
//   return bcrypt.hash(t, salt);
// }
// async function compareTokenHash(token: string, hash: string) {
//   return bcrypt.compare(token, hash);
// }

// /* create JWTs */
// function signAccessToken(payload: object) {
//   return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXP });
// }
// function signRefreshToken(payload: object) {
//   return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXP });
// }

// /* Cookie helpers */
// function setRefreshCookie(res: express.Response, token: string) {
//   const cookieOptions = {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     sameSite: "lax" as "lax",
//     maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
//     domain: process.env.COOKIE_DOMAIN || undefined,
//     path: "/",
//   };
//   res.cookie("refresh_token", token, cookieOptions);
// }

// /* 1) Redirect to GitHub */
// app.get("/auth/github", (req, res) => {
//   const state = crypto.randomBytes(8).toString("hex"); // optional CSRF state
//   // Save state if you want to validate. For brevity we omit persistent state storage.
//   const scope = "read:user user:email";
//   const url =
//     `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&state=${state}`;
//   res.redirect(url);
// });

// /* 2) GitHub callback */
// app.get("/api/auth/github/callback", async (req, res) => {
//   const code = String(req.query.code || "");
//   const state = String(req.query.state || "");
//   if (!code) return res.status(400).send("Missing code");

//   try {
//     // Exchange code for access token
//     const tokenResp = await axios.post(
//       "https://github.com/login/oauth/access_token",
//       {
//         client_id: GITHUB_CLIENT_ID,
//         client_secret: GITHUB_CLIENT_SECRET,
//         code,
//         redirect_uri: REDIRECT_URI,
//       },
//       { headers: { Accept: "application/json" } }
//     );

//     const access_token = tokenResp.data.access_token;
//     if (!access_token) throw new Error("No access token received");

//     // Get user profile
//     const userResp = await axios.get("https://api.github.com/user", {
//       headers: { Authorization: `Bearer ${access_token}` },
//     });

//     const emailsResp = await axios.get("https://api.github.com/user/emails", {
//       headers: { Authorization: `Bearer ${access_token}` },
//     });

//     const primaryEmail = (emailsResp.data || []).find((e: any) => e.primary)?.email ?? null;

//     const ghUser = userResp.data;
//     // upsert user
//     const user = await prisma.user.upsert({
//       where: { githubId: String(ghUser.id) },
//       update: {
//         name: ghUser.name ?? ghUser.login,
//         email: primaryEmail ?? ghUser.email,
//         avatarUrl: ghUser.avatar_url,
//       },
//       create: {
//         githubId: String(ghUser.id),
//         name: ghUser.name ?? ghUser.login,
//         email: primaryEmail ?? ghUser.email,
//         avatarUrl: ghUser.avatar_url,
//       },
//     });

//     // Issue tokens
//     const accessToken = signAccessToken({ sub: user.id, provider: "github" });
//     const refreshToken = signRefreshToken({ sub: user.id });

//     // store hashed refresh token
//     const hashed = await hashToken(refreshToken);
//     const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30d
//     await prisma.refreshToken.create({
//       data: {
//         tokenHash: hashed,
//         userId: user.id,
//         expiresAt,
//       },
//     });

//     // Send refresh token in secure cookie, and access token in JSON or cookie
//     setRefreshCookie(res, refreshToken);

//     // If using Next frontend, redirect to frontend with access token in query (or set in cookie)
//     // For security, better to let frontend request /auth/me to get user after cookie set.
//     // We'll redirect to the frontend home.
//     res.redirect(`${FRONTEND_URL}/auth/success`);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("OAuth error");
//   }
// });

// /* 3) Endpoint to get current user (requires access token in Authorization header) */
// app.get("/api/auth/me", async (req, res) => {
//   const auth = req.headers.authorization;
//   if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
//   const token = auth.split(" ")[1];
//   try {
//     const payload = jwt.verify(token, ACCESS_SECRET) as any;
//     const user = await prisma.user.findUnique({ where: { id: payload.sub } });
//     if (!user) return res.status(404).json({ error: "User not found" });
//     res.json({ user });
//   } catch (err) {
//     return res.status(401).json({ error: "Invalid token" });
//   }
// });

// /* 4) Refresh token endpoint */
// app.post("/api/auth/refresh", async (req, res) => {
//   const rtoken = req.cookies["refresh_token"];
//   if (!rtoken) return res.status(401).json({ error: "Missing refresh token" });

//   try {
//     const payload = jwt.verify(rtoken, REFRESH_SECRET) as any;
//     // find stored hashed tokens for this user and verify
//     const tokens = await prisma.refreshToken.findMany({ where: { userId: payload.sub }});
//     let matched = null;
//     for (const t of tokens) {
//       const ok = await compareTokenHash(rtoken, t.tokenHash);
//       if (ok) { matched = t; break; }
//     }
//     if (!matched) {
//       return res.status(401).json({ error: "Refresh token not found" });
//     }
//     // check expiry
//     if (new Date(matched.expiresAt) < new Date()) {
//       return res.status(401).json({ error: "Refresh token expired" });
//     }
//     // issue new access token and optionally rotate refresh token
//     const newAccessToken = signAccessToken({ sub: payload.sub });
//     const newRefreshToken = signRefreshToken({ sub: payload.sub });
//     const newHash = await hashToken(newRefreshToken);
//     const newExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
//     // delete old token, store new
//     await prisma.refreshToken.delete({ where: { id: matched.id } });
//     await prisma.refreshToken.create({
//       data: { tokenHash: newHash, userId: payload.sub, expiresAt: newExpiry },
//     });
//     setRefreshCookie(res, newRefreshToken);
//     res.json({ accessToken: newAccessToken });
//   } catch (err) {
//     console.error(err);
//     res.status(401).json({ error: "Invalid refresh token" });
//   }
// });

// /* 5) Logout */
// app.post("/api/auth/logout", async (req, res) => {
//   const rtoken = req.cookies["refresh_token"];
//   if (rtoken) {
//     // remove all tokens for this cookie by verifying the token and deleting the matching hashed token
//     try {
//       const payload = jwt.verify(rtoken, REFRESH_SECRET) as any;
//       const tokens = await prisma.refreshToken.findMany({ where: { userId: payload.sub }});
//       for (const t of tokens) {
//         const ok = await compareTokenHash(rtoken, t.tokenHash);
//         if (ok) await prisma.refreshToken.delete({ where: { id: t.id }});
//       }
//     } catch (err) {
//       // ignore
//     }
//   }
//   res.clearCookie("refresh_token", { path: "/", domain: process.env.COOKIE_DOMAIN || undefined });
//   res.json({ ok: true });
// });

// app.listen(PORT, () => {
//   console.log(`Auth server listening on ${PORT}`);
// });
