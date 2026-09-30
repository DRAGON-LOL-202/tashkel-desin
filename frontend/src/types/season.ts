export interface Season {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: string;
  description?: string;
  createdById?: string;
  createdByName?: string;
}

export interface CreateSeasonInput {
  title: string;
  startDate: string;
  endDate: string;
  color: string;
  description?: string;
}
