import { serializeAttachments } from "./attachments.js";
import type { Prisma } from "../generated/prisma/client.ts";

export const feedbackInclude = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.FeedbackInclude;

export type FeedbackWithRefs = Prisma.FeedbackGetPayload<{ include: typeof feedbackInclude }>;

export function serializeFeedback(f: FeedbackWithRefs) {
  return {
    id: f.id,
    title: f.title,
    description: f.description,
    attachments: serializeAttachments(f.attachments),
    type: f.type.toLowerCase() as "problem" | "operational" | "idea",
    status: f.status.toLowerCase() as "open" | "resolved",
    date: f.date,
    createdById: f.createdById,
    createdByName: f.createdBy.name,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}
