export type FeedbackType = "problem" | "operational" | "idea";
export type FeedbackStatus = "open" | "resolved";

export interface Feedback {
  id: string;
  title: string;
  description: string;
  type: FeedbackType;
  status: FeedbackStatus;
  date: string;
  createdAt: string;
}

export interface CreateFeedbackInput {
  title: string;
  description: string;
  type: FeedbackType;
  date: string;
}
