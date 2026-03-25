// auth/auth.routes.ts
import { Router } from "express";
import { authController } from "./auth.controller";

const router: Router = Router();

router.get("/github", authController.githubLogin);
router.get("/github/callback", authController.githubCallback);
router.post("/refresh", authController.refresh);
router.get("/me", authController.me);
router.post("/logout", authController.logout);

export default router;
