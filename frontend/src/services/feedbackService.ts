import { api } from "../lib/api";
import { toAttachmentPayload } from "../lib/attachments";
import type { CreateFeedbackInput, Feedback, FeedbackType } from "../types";

interface FeedbackResponse {
  feedback: Feedback;
}

export const feedbackService = {
  /** المصمم يحصل على ملاحظاته فقط؛ الإدارة على الكل */
  async list(): Promise<Feedback[]> {
    const { feedback } = await api<{ feedback: Feedback[] }>("/feedback");
    return feedback;
  },

  async create(input: CreateFeedbackInput): Promise<Feedback> {
    const { feedback } = await api<FeedbackResponse>("/feedback", {
      method: "POST",
      body: {
        title: input.title,
        description: input.description,
        attachments: (input.attachments ?? []).map(toAttachmentPayload),
        type: input.type,
        date: input.date,
      },
    });
    return feedback;
  },

  /** للإدارة فقط */
  async update(id: string, input: Partial<CreateFeedbackInput>): Promise<Feedback> {
    const { attachments, ...rest } = input;
    const body = attachments === undefined ? rest : { ...rest, attachments: attachments.map(toAttachmentPayload) };
    const { feedback } = await api<FeedbackResponse>(`/feedback/${id}`, { method: "PATCH", body });
    return feedback;
  },

  /** للإدارة فقط: تبديل open ⇄ resolved */
  async toggleStatus(item: Feedback): Promise<Feedback> {
    const status = item.status === "open" ? "resolved" : "open";
    const { feedback } = await api<FeedbackResponse>(`/feedback/${item.id}`, { method: "PATCH", body: { status } });
    return feedback;
  },

  /** للإدارة فقط */
  async remove(id: string): Promise<void> {
    await api<{ ok: true }>(`/feedback/${id}`, { method: "DELETE" });
  },

  /** للإدارة فقط. بدون خيارات = حذف الكل. يعيد عدد المحذوف */
  async removeMany(options?: { type?: FeedbackType; fromDate?: string; toDate?: string }): Promise<number> {
    const { deleted } = await api<{ deleted: number }>("/feedback/bulk-delete", { method: "POST", body: options ?? {} });
    return deleted;
  },
};
