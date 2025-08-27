export interface Auth {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthFilter {
  name?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}