/**
 * GPS Distance Calculation Utilities
 *
 * Implements Haversine formula for calculating distances between GPS coordinates.
 * Critical for BoomCard's 60-meter receipt validation requirement.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Earth's radius in meters
 */
const EARTH_RADIUS_METERS = 6371000;

/**
 * Calculate the distance between two GPS coordinates using the Haversine formula
 *
 * @param lat1 - Latitude of first point (degrees)
 * @param lon1 - Longitude of first point (degrees)
 * @param lat2 - Latitude of second point (degrees)
 * @param lon2 - Longitude of second point (degrees)
 * @returns Distance in meters
 *
 * @example
 * const distance = calculateDistance(42.6977, 23.3219, 42.6980, 23.3225);
 * console.log(distance); // ~50 meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  // Convert degrees to radians
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);

  // Haversine formula
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Distance in meters
  const distance = EARTH_RADIUS_METERS * c;

  return Math.round(distance); // Return rounded to nearest meter
}

/**
 * Calculate distance between two coordinate objects
 *
 * @param coord1 - First coordinate {latitude, longitude}
 * @param coord2 - Second coordinate {latitude, longitude}
 * @returns Distance in meters
 */
export function calculateDistanceBetweenCoords(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  return calculateDistance(
    coord1.latitude,
    coord1.longitude,
    coord2.latitude,
    coord2.longitude
  );
}

/**
 * Check if user is within specified radius of a venue
 * CRITICAL: This enforces BoomCard's 60-meter requirement for receipt validation
 *
 * @param userLat - User's latitude
 * @param userLon - User's longitude
 * @param venueLat - Venue's latitude
 * @param venueLon - Venue's longitude
 * @param radiusMeters - Maximum allowed radius (default: 60 meters)
 * @returns true if user is within radius, false otherwise
 *
 * @example
 * const isValid = isWithinRadius(42.6977, 23.3219, 42.6978, 23.3220, 60);
 * if (!isValid) {
 *   throw new Error('You must be within 60 meters of the venue to submit this receipt');
 * }
 */
export function isWithinRadius(
  userLat: number,
  userLon: number,
  venueLat: number,
  venueLon: number,
  radiusMeters: number = 60
): boolean {
  const distance = calculateDistance(userLat, userLon, venueLat, venueLon);
  return distance <= radiusMeters;
}

/**
 * Check if coordinates are within radius using coordinate objects
 *
 * @param userCoords - User's coordinates
 * @param venueCoords - Venue's coordinates
 * @param radiusMeters - Maximum allowed radius (default: 60 meters)
 * @returns Object with validation result, distance, and error message if applicable
 */
export function validateLocationProximity(
  userCoords: Coordinates,
  venueCoords: Coordinates,
  radiusMeters: number = 60
): {
  isValid: boolean;
  distance: number;
  message: string;
} {
  const distance = calculateDistanceBetweenCoords(userCoords, venueCoords);
  const isValid = distance <= radiusMeters;

  return {
    isValid,
    distance,
    message: isValid
      ? `You are ${distance}m from the venue (within ${radiusMeters}m limit)`
      : `You are ${distance}m from the venue. You must be within ${radiusMeters}m to submit this receipt.`,
  };
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Format distance for display
 *
 * @param meters - Distance in meters
 * @returns Formatted string (e.g., "50m" or "1.2km")
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  } else {
    return `${(meters / 1000).toFixed(1)}km`;
  }
}

/**
 * Validate GPS coordinates
 *
 * @param lat - Latitude
 * @param lon - Longitude
 * @returns true if valid coordinates, false otherwise
 */
export function isValidCoordinates(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Get approximate coordinates for Bulgarian cities (for testing/fallback)
 */
export const BULGARIAN_CITIES = {
  Sofia: { latitude: 42.6977, longitude: 23.3219 },
  Plovdiv: { latitude: 42.1354, longitude: 24.7453 },
  Varna: { latitude: 43.2141, longitude: 27.9147 },
  Burgas: { latitude: 42.5048, longitude: 27.4626 },
  Bansko: { latitude: 41.8356, longitude: 23.4874 },
};
