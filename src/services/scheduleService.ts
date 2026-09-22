import type { CreateSeasonInput, Season } from "../types";
import { generateId, readStorage, writeStorage } from "../lib/storage";
import { seedSeasons } from "../data/seed";

const KEY = "design_seasons";

function getAll(): Season[] {
  return readStorage<Season[]>(KEY, seedSeasons);
}
function saveAll(items: Season[]): void {
  writeStorage(KEY, items);
}

export const scheduleService = {
  list(): Season[] {
    return getAll();
  },

  create(input: CreateSeasonInput): Season[] {
    const item: Season = {
      id: generateId("season"),
      ...input,
    };
    const all = [item, ...getAll()];
    saveAll(all);
    return all;
  },

  update(id: string, input: Partial<CreateSeasonInput>): Season[] {
    const all = getAll().map((s) => (s.id === id ? { ...s, ...input } : s));
    saveAll(all);
    return all;
  },

  remove(id: string): Season[] {
    const all = getAll().filter((s) => s.id !== id);
    saveAll(all);
    return all;
  },
};
