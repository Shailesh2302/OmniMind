// import "dotenv/config";
import { Request, Response } from "express";
import { prisma } from "@repo/db"; // adjust import path
import { z } from "zod";


// Validation schema
const CreateUserSchema = z.object({
  email: z.string().email().optional(),
  avatar_url: z.string().optional(),
  display_name: z.string().optional(),
  github_id: z.string(), // REQUIRED + unique
  profile_url: z.string().optional(),
  username: z.string().optional(),
});

export async function createUser(req: Request, res: Response) {
  try {
    // Validate body
    const data = CreateUserSchema.parse(req.body);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        avatar_url: data.avatar_url ?? "temp avatar_url",
        display_name: data.display_name ?? "temp display_name",
        github_id: data.github_id,
        profile_url: data.profile_url ?? "temp profile_url",
        username: data.username ?? "temp username",
      },
    });

    return res.status(201).json({
      success: true,
      user,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err });
    }

    console.error(err);
    return res.status(500).json({ error: "Failed to create user" });
  }
}
