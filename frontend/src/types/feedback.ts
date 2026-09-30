export type FeedbackType = "problem" | "operational" | "idea";
export type FeedbackStatus = "open" | "resolved";

export interface Feedback {
  id: string;
  title: string;
  description: string;
  attachments?: ImageAttachment[];
  type: FeedbackType;
  status: FeedbackStatus;
  date: string;
  createdAt: string;
  createdById?: string;
  createdByName?: string;
}

export interface CreateFeedbackInput {
  title: string;
  description: string;
  attachments?: ImageAttachment[];
  type: FeedbackType;
  date: string;
}
import type { ImageAttachment } from "./attachment";
