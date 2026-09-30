import { api } from "../lib/api";
import type { CreateSeasonInput, Season } from "../types";

interface EventResponse {
  event: Season;
}

// التقويم السنوي (Season في الواجهة = CalendarEvent في الـ backend). للإدارة فقط.
export const scheduleService = {
  async list(): Promise<Season[]> {
    const { events } = await api<{ events: Season[] }>("/calendar-events");
    return events;
  },

  async create(input: CreateSeasonInput): Promise<Season> {
    const { event } = await api<EventResponse>("/calendar-events", { method: "POST", body: input });
    return event;
  },

  async update(id: string, input: Partial<CreateSeasonInput>): Promise<Season> {
    const { event } = await api<EventResponse>(`/calendar-events/${id}`, { method: "PATCH", body: input });
    return event;
  },

  async remove(id: string): Promise<void> {
    await api<{ ok: true }>(`/calendar-events/${id}`, { method: "DELETE" });
  },
};
