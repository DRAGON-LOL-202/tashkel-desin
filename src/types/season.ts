export interface Season {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: string;
  description?: string;
}

export interface CreateSeasonInput {
  title: string;
  startDate: string;
  endDate: string;
  color: string;
  description?: string;
}
