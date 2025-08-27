export interface QrCodes {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QrCodesFilter {
  name?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}