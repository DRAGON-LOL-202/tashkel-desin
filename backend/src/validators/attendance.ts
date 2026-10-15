import { z } from "zod";

export const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الشهر بصيغة YYYY-MM"),
});
