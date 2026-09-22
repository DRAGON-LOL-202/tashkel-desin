import type { CreateFeedbackInput, Feedback } from "../types";
import { generateId, readStorage, writeStorage } from "../lib/storage";
import { seedFeedback } from "../data/seed";

const KEY = "design_feedback";

function getAll(): Feedback[] {
  return readStorage<Feedback[]>(KEY, seedFeedback);
}
function saveAll(items: Feedback[]): void {
  writeStorage(KEY, items);
}

export const feedbackService = {
  list(): Feedback[] {
    return getAll();
  },

  create(input: CreateFeedbackInput): Feedback[] {
    const item: Feedback = {
      id: generateId("fb"),
      title: input.title,
      description: input.description,
      type: input.type,
      status: "open",
      date: input.date,
      createdAt: new Date().toISOString(),
    };
    const all = [item, ...getAll()];
    saveAll(all);
    return all;
  },

  update(id: string, input: Partial<CreateFeedbackInput>): Feedback[] {
    const all = getAll().map((f) => (f.id === id ? { ...f, ...input } : f));
    saveAll(all);
    return all;
  },

  toggleStatus(id: string): Feedback[] {
    const all = getAll().map((f) =>
      f.id === id
        ? { ...f, status: f.status === "open" ? ("resolved" as const) : ("open" as const) }
        : f
    );
    saveAll(all);
    return all;
  },

  remove(id: string): Feedback[] {
    const all = getAll().filter((f) => f.id !== id);
    saveAll(all);
    return all;
  },

  removeMany(type?: Feedback["type"]): Feedback[] {
    const all = type ? getAll().filter((f) => f.type !== type) : [];
    saveAll(all);
    return all;
  },
};
