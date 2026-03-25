// src/modules/auth/auth.service.ts
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import axios from "axios";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@repo/db"; // make sure @repo/db exports `prisma: PrismaClient`

/* ---------------------------
 * Validate required env vars
 * -------------------------- */
const {
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GITHUB_REDIRECT_URI,
  JWT_ACCESS_TOKEN_SECRET,
  JWT_REFRESH_TOKEN_SECRET,
  ACCESS_TOKEN_EXP = "15m",
  REFRESH_TOKEN_EXP = "30d",
} = process.env;

function assertEnv(name: string, val: string | undefined) {
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

assertEnv("GITHUB_CLIENT_ID", GITHUB_CLIENT_ID);
assertEnv("GITHUB_CLIENT_SECRET", GITHUB_CLIENT_SECRET);
assertEnv("GITHUB_REDIRECT_URI", GITHUB_REDIRECT_URI);
assertEnv("JWT_ACCESS_TOKEN_SECRET", JWT_ACCESS_TOKEN_SECRET);
assertEnv("JWT_REFRESH_TOKEN_SECRET", JWT_REFRESH_TOKEN_SECRET);

/* ---------------------------
 * Simple types
 * -------------------------- */
type GithubProfile = {
  github_id: string; // matches Prisma schema
  email: string | null;
  username: string;
  avatar_url: string | null;
};

export class AuthService {
  /* ----------------------------------------
   * Step 1: Redirect URL to GitHub
   ---------------------------------------- */
  generateGithubAuthUrl() {
    const state = crypto.randomBytes(8).toString("hex");
    const scope = "read:user user:email";

    const url =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(GITHUB_CLIENT_ID!)}` +
      `&redirect_uri=${encodeURIComponent(GITHUB_REDIRECT_URI!)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${state}`;

    return { url, state };
  }

  /* ----------------------------------------
   * Step 2: GitHub Callback → Token exchange
   ---------------------------------------- */
  async exchangeGithubCodeForToken(code: string) {
    const res = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_REDIRECT_URI,
      },
      { headers: { Accept: "application/json" } }
    );

    if (res.data.error) {
      throw new Error(
        `GitHub token error: ${res.data.error_description ?? res.data.error}`
      );
    }

    return res.data.access_token as string;
  }

  /* ----------------------------------------
   * Step 3: Get GitHub user profile
   ---------------------------------------- */
  async fetchGithubUser(accessToken: string): Promise<GithubProfile> {
    const userResp = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const emailsResp = await axios.get("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const primaryEmail =
      (Array.isArray(emailsResp.data)
        ? emailsResp.data.find((e: any) => e.primary)?.email
        : null) ?? null;

    const user = userResp.data;

    return {
      github_id: String(user.id),
      email: primaryEmail,
      username: user.name ?? user.login,
      avatar_url: user.avatar_url ?? null,
    };
  }

  /* ----------------------------------------
   * Step 4: Upsert user in DB
   * Matches your Prisma schema fields (snake_case)
   ---------------------------------------- */
  async upsertUser(data: GithubProfile) {
    // prisma schema has fields: github_id, username, avatar_url, email
    return prisma.user.upsert({
      where: { github_id: data.github_id },
      update: {
        email: data.email,
        username: data.username,
        avatar_url: data.avatar_url ?? undefined,
        last_login_at: new Date(),
      },
      create: {
        github_id: data.github_id,
        email: data.email,
        username: data.username,
        avatar_url: data.avatar_url ?? undefined,
        last_login_at: new Date(),
      },
    });
  }

  /* ----------------------------------------
   * JWT helpers
   ---------------------------------------- */
  signAccessToken(payload: object) {
    return jwt.sign(payload, JWT_ACCESS_TOKEN_SECRET!, {
      expiresIn: ACCESS_TOKEN_EXP,
    });
  }

  signRefreshToken(payload: object) {
    return jwt.sign(payload, JWT_REFRESH_TOKEN_SECRET!, {
      expiresIn: REFRESH_TOKEN_EXP,
    });
  }

  /* ----------------------------------------
   * Refresh Token storage (hashed)
   ---------------------------------------- */
  async storeRefreshToken(userId: string, token: string) {
    const hashed = await bcrypt.hash(token, 10);

    return prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashed,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
      },
    });
  }

  async validateRefreshToken(userId: string, token: string) {
    const list = await prisma.refreshToken.findMany({ where: { userId } });

    for (const entry of list) {
      const isValid = await bcrypt.compare(token, entry.tokenHash);
      if (isValid) return entry;
    }

    return null;
  }

  async deleteRefreshToken(id: string) {
    return prisma.refreshToken.delete({ where: { id } });
  }

  /* ----------------------------------------
   * Refresh endpoint logic
   ---------------------------------------- */
  async refreshTokens(refreshToken: string) {
    const payload: any = jwt.verify(refreshToken, JWT_REFRESH_TOKEN_SECRET!);

    const entry = await this.validateRefreshToken(payload.sub, refreshToken);
    if (!entry) throw new Error("Invalid refresh token");

    // rotate token
    await this.deleteRefreshToken(entry.id);

    const newAccess = this.signAccessToken({ sub: payload.sub });
    const newRefresh = this.signRefreshToken({ sub: payload.sub });

    await this.storeRefreshToken(payload.sub, newRefresh);

    return { accessToken: newAccess, refreshToken: newRefresh };
  }

  /* ----------------------------------------
   * Get user profile from JWT access token
   ---------------------------------------- */
  async getUserFromAccessToken(token: string) {
    const payload: any = jwt.verify(token, JWT_ACCESS_TOKEN_SECRET!);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    return user;
  }
}

export const authService = new AuthService();
