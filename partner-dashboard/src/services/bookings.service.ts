/**
 * Bookings Service
 *
 * Complete booking and reservation management service for:
 * - Restaurant reservations
 * - Hotel bookings
 * - Experience reservations
 * - Spa appointments
 * - Event tickets
 */

import { apiService } from './api.service';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'rejected';

export type BookingType =
  | 'restaurant'
  | 'hotel'
  | 'spa'
  | 'experience'
  | 'event'
  | 'activity';

export interface BookingGuest {
  name: string;
  email: string;
  phone: string;
  specialRequests?: string;
}

export interface BookingDetails {
  id: string;
  type: BookingType;
  status: BookingStatus;
  bookingNumber: string;

  // Venue/Offer info
  venueId: string;
  venueName: string;
  venueNameBg: string;
  offerId?: string;
  offerTitle?: string;
  offerTitleBg?: string;

  // User info
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;

  // Guest info
  guests: BookingGuest[];
  guestCount: number;

  // Date/Time
  date: string; // ISO date
  time: string; // HH:mm format
  duration?: number; // minutes
  checkIn?: string; // For hotels
  checkOut?: string; // For hotels

  // Pricing
  price: number;
  currency: string;
  discount?: number;
  finalPrice: number;
  tax?: number;
  serviceFee?: number;

  // Additional info
  specialRequests?: string;
  notes?: string;
  confirmationCode?: string;
  cancellationPolicy?: string;

  // Metadata
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface CreateBookingData {
  type: BookingType;
  venueId: string;
  offerId?: string;
  date: string;
  time: string;
  guestCount: number;
  guests: BookingGuest[];
  specialRequests?: string;
  checkIn?: string;
  checkOut?: string;
  promoCode?: string;
}

export interface BookingAvailability {
  date: string;
  slots: Array<{
    time: string;
    available: boolean;
    price: number;
    guestsAvailable: number;
  }>;
}

export interface BookingFilters {
  type?: BookingType;
  status?: BookingStatus;
  venueId?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'date' | 'createdAt' | 'price' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedBookings {
  data: BookingDetails[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BookingStatistics {
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  completed: number;
  noShow: number;
  totalRevenue: number;
  averageBookingValue: number;
  cancellationRate: number;
  noShowRate: number;
  popularDates: Array<{ date: string; count: number }>;
  popularTimes: Array<{ time: string; count: number }>;
  byType: Record<BookingType, number>;
}

export interface CancellationPolicy {
  venueId: string;
  refundable: boolean;
  cancellationDeadlineHours: number;
  refundPercentage: number;
  policy: string;
  policyBg: string;
}

class BookingsService {
  private readonly baseUrl = '/bookings';

  /**
   * Get all bookings with filters
   */
  async getBookings(filters?: BookingFilters): Promise<PaginatedBookings> {
    return apiService.get<PaginatedBookings>(this.baseUrl, filters);
  }

  /**
   * Get booking by ID
   */
  async getBookingById(id: string): Promise<BookingDetails> {
    return apiService.get<BookingDetails>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get user's bookings
   */
  async getUserBookings(userId: string, filters?: BookingFilters): Promise<PaginatedBookings> {
    return apiService.get<PaginatedBookings>(`${this.baseUrl}/user/${userId}`, filters);
  }

  /**
   * Get venue's bookings (for partners)
   */
  async getVenueBookings(venueId: string, filters?: BookingFilters): Promise<PaginatedBookings> {
    return apiService.get<PaginatedBookings>(`${this.baseUrl}/venue/${venueId}`, filters);
  }

  /**
   * Get bookings by status
   */
  async getBookingsByStatus(status: BookingStatus, filters?: BookingFilters): Promise<PaginatedBookings> {
    return apiService.get<PaginatedBookings>(`${this.baseUrl}/status/${status}`, filters);
  }

  /**
   * Check availability for venue/offer
   */
  async checkAvailability(
    venueId: string,
    date: string,
    guestCount: number,
    offerId?: string
  ): Promise<BookingAvailability> {
    return apiService.get<BookingAvailability>(`${this.baseUrl}/availability`, {
      venueId,
      date,
      guestCount,
      offerId,
    });
  }

  /**
   * Check availability for date range
   */
  async checkAvailabilityRange(
    venueId: string,
    startDate: string,
    endDate: string,
    guestCount: number,
    offerId?: string
  ): Promise<BookingAvailability[]> {
    return apiService.get<BookingAvailability[]>(`${this.baseUrl}/availability/range`, {
      venueId,
      startDate,
      endDate,
      guestCount,
      offerId,
    });
  }

  /**
   * Create new booking
   */
  async createBooking(data: CreateBookingData): Promise<BookingDetails> {
    return apiService.post<BookingDetails>(this.baseUrl, data);
  }

  /**
   * Update booking
   */
  async updateBooking(id: string, updates: Partial<CreateBookingData>): Promise<BookingDetails> {
    return apiService.put<BookingDetails>(`${this.baseUrl}/${id}`, updates);
  }

  /**
   * Confirm booking
   */
  async confirmBooking(id: string, confirmationCode?: string): Promise<BookingDetails> {
    return apiService.post<BookingDetails>(`${this.baseUrl}/${id}/confirm`, {
      confirmationCode,
    });
  }

  /**
   * Cancel booking
   */
  async cancelBooking(id: string, reason?: string): Promise<BookingDetails> {
    return apiService.post<BookingDetails>(`${this.baseUrl}/${id}/cancel`, {
      reason,
    });
  }

  /**
   * Mark booking as completed
   */
  async completeBooking(id: string, rating?: number, review?: string): Promise<BookingDetails> {
    return apiService.post<BookingDetails>(`${this.baseUrl}/${id}/complete`, {
      rating,
      review,
    });
  }

  /**
   * Mark booking as no-show
   */
  async markNoShow(id: string): Promise<BookingDetails> {
    return apiService.post<BookingDetails>(`${this.baseUrl}/${id}/no-show`);
  }

  /**
   * Reschedule booking
   */
  async rescheduleBooking(
    id: string,
    newDate: string,
    newTime: string
  ): Promise<BookingDetails> {
    return apiService.post<BookingDetails>(`${this.baseUrl}/${id}/reschedule`, {
      date: newDate,
      time: newTime,
    });
  }

  /**
   * Add special requests to booking
   */
  async addSpecialRequests(id: string, requests: string): Promise<BookingDetails> {
    return apiService.post<BookingDetails>(`${this.baseUrl}/${id}/special-requests`, {
      requests,
    });
  }

  /**
   * Add guests to booking
   */
  async addGuests(id: string, guests: BookingGuest[]): Promise<BookingDetails> {
    return apiService.post<BookingDetails>(`${this.baseUrl}/${id}/guests`, {
      guests,
    });
  }

  /**
   * Apply promo code
   */
  async applyPromoCode(id: string, promoCode: string): Promise<BookingDetails> {
    return apiService.post<BookingDetails>(`${this.baseUrl}/${id}/promo-code`, {
      promoCode,
    });
  }

  /**
   * Get booking statistics
   */
  async getStatistics(startDate?: string, endDate?: string): Promise<BookingStatistics> {
    return apiService.get<BookingStatistics>(`${this.baseUrl}/statistics`, {
      startDate,
      endDate,
    });
  }

  /**
   * Get venue booking statistics
   */
  async getVenueStatistics(
    venueId: string,
    startDate?: string,
    endDate?: string
  ): Promise<BookingStatistics> {
    return apiService.get<BookingStatistics>(`${this.baseUrl}/statistics/venue/${venueId}`, {
      startDate,
      endDate,
    });
  }

  /**
   * Get cancellation policy for venue
   */
  async getCancellationPolicy(venueId: string): Promise<CancellationPolicy> {
    return apiService.get<CancellationPolicy>(`${this.baseUrl}/cancellation-policy/${venueId}`);
  }

  /**
   * Send booking confirmation email
   */
  async sendConfirmationEmail(id: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/${id}/send-confirmation`);
  }

  /**
   * Send booking reminder
   */
  async sendReminder(id: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/${id}/send-reminder`);
  }

  /**
   * Export bookings
   */
  async exportBookings(
    filters?: BookingFilters,
    format: 'csv' | 'xlsx' | 'pdf' = 'csv'
  ): Promise<Blob> {
    return apiService.get<Blob>(`${this.baseUrl}/export`, {
      ...filters,
      format,
    }, {
      responseType: 'blob',
    });
  }

  /**
   * Get upcoming bookings
   */
  async getUpcomingBookings(userId?: string, limit: number = 10): Promise<BookingDetails[]> {
    return apiService.get<BookingDetails[]>(`${this.baseUrl}/upcoming`, {
      userId,
      limit,
    });
  }

  /**
   * Get past bookings
   */
  async getPastBookings(userId?: string, limit: number = 10): Promise<BookingDetails[]> {
    return apiService.get<BookingDetails[]>(`${this.baseUrl}/past`, {
      userId,
      limit,
    });
  }

  /**
   * Get booking QR code
   */
  async getBookingQRCode(id: string): Promise<string> {
    const response = await apiService.get<{ qrCode: string }>(`${this.baseUrl}/${id}/qr-code`);
    return response.qrCode;
  }

  /**
   * Verify booking with QR code
   */
  async verifyBookingQR(qrCode: string): Promise<BookingDetails> {
    return apiService.post<BookingDetails>(`${this.baseUrl}/verify-qr`, {
      qrCode,
    });
  }

  /**
   * Get booking calendar
   * Returns bookings grouped by date for calendar view
   */
  async getBookingCalendar(
    venueId: string,
    startDate: string,
    endDate: string
  ): Promise<Record<string, BookingDetails[]>> {
    return apiService.get<Record<string, BookingDetails[]>>(`${this.baseUrl}/calendar`, {
      venueId,
      startDate,
      endDate,
    });
  }

  /**
   * Calculate booking price
   */
  async calculatePrice(data: CreateBookingData): Promise<{
    basePrice: number;
    discount: number;
    tax: number;
    serviceFee: number;
    finalPrice: number;
  }> {
    return apiService.post(`${this.baseUrl}/calculate-price`, data);
  }

  /**
   * Get recommended booking times
   * Based on venue availability and user preferences
   */
  async getRecommendedTimes(
    venueId: string,
    date: string,
    guestCount: number
  ): Promise<Array<{ time: string; score: number; reason: string }>> {
    return apiService.get(`${this.baseUrl}/recommended-times`, {
      venueId,
      date,
      guestCount,
    });
  }
}

// Export singleton instance
export const bookingsService = new BookingsService();
export default bookingsService;
