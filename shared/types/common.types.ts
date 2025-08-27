export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  USER = 'USER',
  PARTNER = 'PARTNER',
  ADMIN = 'ADMIN'
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Location {
  lat: number;
  lng: number;
  address: string;
  city?: string;
  country?: string;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface FileUpload {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}