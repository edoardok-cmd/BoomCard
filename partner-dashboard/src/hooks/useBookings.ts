import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingsService, BookingDetails, BookingFilters, CreateBookingData, BookingStatus } from '../services/bookings.service';
import toast from 'react-hot-toast';

/**
 * Hook to fetch bookings with filters
 */
export function useBookings(filters?: BookingFilters) {
  return useQuery({
    queryKey: ['bookings', filters],
    queryFn: () => bookingsService.getBookings(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to fetch a single booking by ID
 */
export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: ['booking', id],
    queryFn: () => bookingsService.getBookingById(id!),
    enabled: !!id,
  });
}

/**
 * Hook to fetch user's bookings
 */
export function useUserBookings(userId: string | undefined, filters?: BookingFilters) {
  return useQuery({
    queryKey: ['bookings', 'user', userId, filters],
    queryFn: () => bookingsService.getUserBookings(userId!, filters),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch venue's bookings
 */
export function useVenueBookings(venueId: string | undefined, filters?: BookingFilters) {
  return useQuery({
    queryKey: ['bookings', 'venue', venueId, filters],
    queryFn: () => bookingsService.getVenueBookings(venueId!, filters),
    enabled: !!venueId,
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to fetch bookings by status
 */
export function useBookingsByStatus(status: BookingStatus, filters?: BookingFilters) {
  return useQuery({
    queryKey: ['bookings', 'status', status, filters],
    queryFn: () => bookingsService.getBookingsByStatus(status, filters),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to check availability
 */
export function useAvailability(
  venueId: string | undefined,
  date: string | undefined,
  guestCount: number,
  offerId?: string
) {
  return useQuery({
    queryKey: ['availability', venueId, date, guestCount, offerId],
    queryFn: () => bookingsService.checkAvailability(venueId!, date!, guestCount, offerId),
    enabled: !!venueId && !!date,
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to check availability range
 */
export function useAvailabilityRange(
  venueId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  guestCount: number,
  offerId?: string
) {
  return useQuery({
    queryKey: ['availability', 'range', venueId, startDate, endDate, guestCount, offerId],
    queryFn: () => bookingsService.checkAvailabilityRange(venueId!, startDate!, endDate!, guestCount, offerId),
    enabled: !!venueId && !!startDate && !!endDate,
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to get upcoming bookings
 */
export function useUpcomingBookings(userId?: string, limit: number = 10) {
  return useQuery({
    queryKey: ['bookings', 'upcoming', userId, limit],
    queryFn: () => bookingsService.getUpcomingBookings(userId, limit),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to get past bookings
 */
export function usePastBookings(userId?: string, limit: number = 10) {
  return useQuery({
    queryKey: ['bookings', 'past', userId, limit],
    queryFn: () => bookingsService.getPastBookings(userId, limit),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to get booking statistics
 */
export function useBookingStatistics(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['bookings', 'statistics', startDate, endDate],
    queryFn: () => bookingsService.getStatistics(startDate, endDate),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to get venue booking statistics
 */
export function useVenueBookingStatistics(
  venueId: string | undefined,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: ['bookings', 'statistics', 'venue', venueId, startDate, endDate],
    queryFn: () => bookingsService.getVenueStatistics(venueId!, startDate, endDate),
    enabled: !!venueId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to get cancellation policy
 */
export function useCancellationPolicy(venueId: string | undefined) {
  return useQuery({
    queryKey: ['cancellation-policy', venueId],
    queryFn: () => bookingsService.getCancellationPolicy(venueId!),
    enabled: !!venueId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to get booking calendar
 */
export function useBookingCalendar(
  venueId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined
) {
  return useQuery({
    queryKey: ['bookings', 'calendar', venueId, startDate, endDate],
    queryFn: () => bookingsService.getBookingCalendar(venueId!, startDate!, endDate!),
    enabled: !!venueId && !!startDate && !!endDate,
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to get booking QR code
 */
export function useBookingQRCode(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['booking', bookingId, 'qr-code'],
    queryFn: () => bookingsService.getBookingQRCode(bookingId!),
    enabled: !!bookingId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to get recommended times
 */
export function useRecommendedTimes(
  venueId: string | undefined,
  date: string | undefined,
  guestCount: number
) {
  return useQuery({
    queryKey: ['recommended-times', venueId, date, guestCount],
    queryFn: () => bookingsService.getRecommendedTimes(venueId!, date!, guestCount),
    enabled: !!venueId && !!date,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to create booking
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBookingData) => bookingsService.createBooking(data),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      toast.success('Booking created successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create booking');
    },
  });
}

/**
 * Hook to update booking
 */
export function useUpdateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CreateBookingData> }) =>
      bookingsService.updateBooking(id, updates),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      toast.success('Booking updated successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update booking');
    },
  });
}

/**
 * Hook to confirm booking
 */
export function useConfirmBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, code }: { id: string; code?: string }) =>
      bookingsService.confirmBooking(id, code),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      toast.success('Booking confirmed!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to confirm booking');
    },
  });
}

/**
 * Hook to cancel booking
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      bookingsService.cancelBooking(id, reason),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      toast.success('Booking cancelled');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to cancel booking');
    },
  });
}

/**
 * Hook to complete booking
 */
export function useCompleteBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, rating, review }: { id: string; rating?: number; review?: string }) =>
      bookingsService.completeBooking(id, rating, review),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      toast.success('Booking completed!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to complete booking');
    },
  });
}

/**
 * Hook to mark booking as no-show
 */
export function useMarkNoShow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => bookingsService.markNoShow(id),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      toast.success('Marked as no-show');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to mark as no-show');
    },
  });
}

/**
 * Hook to reschedule booking
 */
export function useRescheduleBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, date, time }: { id: string; date: string; time: string }) =>
      bookingsService.rescheduleBooking(id, date, time),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      toast.success('Booking rescheduled!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to reschedule booking');
    },
  });
}

/**
 * Hook to add special requests
 */
export function useAddSpecialRequests() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, requests }: { id: string; requests: string }) =>
      bookingsService.addSpecialRequests(id, requests),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      toast.success('Special requests added!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add special requests');
    },
  });
}

/**
 * Hook to apply promo code
 */
export function useApplyPromoCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      bookingsService.applyPromoCode(id, code),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      toast.success('Promo code applied!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Invalid promo code');
    },
  });
}

/**
 * Hook to verify booking with QR code
 */
export function useVerifyBookingQR() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (qrCode: string) => bookingsService.verifyBookingQR(qrCode),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      toast.success('Booking verified!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Invalid QR code');
    },
  });
}

/**
 * Hook to send confirmation email
 */
export function useSendConfirmationEmail() {
  return useMutation({
    mutationFn: (id: string) => bookingsService.sendConfirmationEmail(id),
    onSuccess: () => {
      toast.success('Confirmation email sent!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send email');
    },
  });
}

/**
 * Hook to send reminder
 */
export function useSendReminder() {
  return useMutation({
    mutationFn: (id: string) => bookingsService.sendReminder(id),
    onSuccess: () => {
      toast.success('Reminder sent!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send reminder');
    },
  });
}

/**
 * Hook to calculate booking price
 */
export function useCalculatePrice() {
  return useMutation({
    mutationFn: (data: CreateBookingData) => bookingsService.calculatePrice(data),
    onError: (error: any) => {
      toast.error(error.message || 'Failed to calculate price');
    },
  });
}
