import type { Prisma } from "../generated/prisma/client.ts";

export const calendarEventInclude = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.CalendarEventInclude;

export type CalendarEventWithRefs = Prisma.CalendarEventGetPayload<{ include: typeof calendarEventInclude }>;

// الشكل متوافق مع نوع Season في الواجهة (id, title, startDate, endDate, color, description?).
export function serializeCalendarEvent(e: CalendarEventWithRefs) {
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? undefined,
    startDate: e.startDate,
    endDate: e.endDate,
    color: e.color,
    createdById: e.createdById,
    createdByName: e.createdBy.name,
    createdAt: e.createdAt.getTime(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
