import { z } from "zod";

export const RefreshSchema = z.object({});
export type RefreshDto = z.infer<typeof RefreshSchema>;
