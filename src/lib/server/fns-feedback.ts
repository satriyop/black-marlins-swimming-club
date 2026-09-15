import { createServerFn } from "@tanstack/react-start";
import type { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireClub } from "@/lib/club/context";
import {
  createCoachFeedback,
  createFeedbackSchema,
  retractCoachFeedback,
  retractFeedbackSchema,
  updateCoachFeedback,
  updateFeedbackSchema,
} from "@/lib/club/feedback";

export const createClubCoachFeedback = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: z.input<typeof createFeedbackSchema>) => input)
  .handler(async ({ context, data }) =>
    createCoachFeedback(await requireClub(context.userId), data),
  );

export const updateClubCoachFeedback = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: z.input<typeof updateFeedbackSchema>) => input)
  .handler(async ({ context, data }) =>
    updateCoachFeedback(await requireClub(context.userId), data),
  );

export const retractClubCoachFeedback = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: z.input<typeof retractFeedbackSchema>) => input)
  .handler(async ({ context, data }) =>
    retractCoachFeedback(await requireClub(context.userId), data),
  );
