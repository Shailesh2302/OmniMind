// auth/auth.controller.ts
import { Request, Response } from "express";
import { authService } from "./auth.service";

export class AuthController {
  /* --------------------------
   * GET /auth/github
   -------------------------- */
  githubLogin = (req: Request, res: Response) => {
    const { url } = authService.generateGithubAuthUrl();
    res.redirect(url);
  };

  /* --------------------------
   * GET /auth/github/callback
   -------------------------- */
  githubCallback = async (req: Request, res: Response) => {
    const code = req.query.code as string;

    try {
      const accessToken = await authService.exchangeGithubCodeForToken(code);

      const ghUser = await authService.fetchGithubUser(accessToken);

      const user = await authService.upsertUser(ghUser);

      // issue JWT tokens
      const jwtAccess = authService.signAccessToken({ sub: user.id });
      const jwtRefresh = authService.signRefreshToken({ sub: user.id });

      await authService.storeRefreshToken(user.id, jwtRefresh);

      // send refresh token as secure cookie
      res.cookie("refresh_token", jwtRefresh, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 30,
        path: "/",
      });

      return res.redirect(`${process.env.FRONTEND_URL}/auth/success`);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "OAuth Failed" });
    }
  };

  /* --------------------------
   * POST /auth/refresh
   -------------------------- */
  refresh = async (req: Request, res: Response) => {
    const token = req.cookies.refresh_token;
    if (!token) return res.status(401).json({ error: "Missing refresh token" });

    try {
      const { accessToken, refreshToken } =
        await authService.refreshTokens(token);

      res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 30,
        path: "/",
      });

      return res.json({ accessToken });
    } catch {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
  };

  /* --------------------------
   * GET /auth/me
   -------------------------- */
  me = async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer "))
      return res.status(401).json({ error: "Missing token" });

    const token: string | undefined = auth.split(" ")[1];

    if(!token){
        return res.json({message:"token is undefined"})
    }

    try {
      const user = await authService.getUserFromAccessToken(token);
      if (!user) return res.status(404).json({ error: "User not found" });

      return res.json({ user });
    } catch (e) {
      return res.status(401).json({ error: "Invalid token" });
    }
  };

  /* --------------------------
   * POST /auth/logout
   -------------------------- */
  logout = async (req: Request, res: Response) => {
    res.clearCookie("refresh_token", {
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    res.json({ ok: true });
  };
}

export const authController = new AuthController();
