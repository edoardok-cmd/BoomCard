/**
 * Location Service
 *
 * Handles GPS permissions, location tracking, and coordinate capture
 * Critical for BoomCard's 60-meter receipt validation requirement
 */

import * as Location from 'expo-location';
import { GPS_CONFIG } from '../constants/config';
import type {
  LocationCoordinates,
  LocationPermissionStatus,
  GPSValidationResult,
} from '../types';
import {
  calculateDistanceBetweenCoords,
  validateLocationProximity,
  isValidCoordinates,
} from '../utils/distance';

export class LocationService {
  private static instance: LocationService;
  private currentLocation: Location.LocationObject | null = null;
  private locationSubscription: Location.LocationSubscription | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  /**
   * Request location permissions from user
   * Required before any location operations
   */
  async requestPermissions(): Promise<LocationPermissionStatus> {
    try {
      const { status, canAskAgain } =
        await Location.requestForegroundPermissionsAsync();

      return {
        granted: status === 'granted',
        canAskAgain,
        status,
      };
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return {
        granted: false,
        canAskAgain: false,
        status: 'error',
      };
    }
  }

  /**
   * Check if location permissions are granted
   */
  async checkPermissions(): Promise<LocationPermissionStatus> {
    try {
      const { status, canAskAgain } =
        await Location.getForegroundPermissionsAsync();

      return {
        granted: status === 'granted',
        canAskAgain,
        status,
      };
    } catch (error) {
      console.error('Error checking location permissions:', error);
      return {
        granted: false,
        canAskAgain: false,
        status: 'error',
      };
    }
  }

  /**
   * Get current location with high accuracy
   * CRITICAL: Used for receipt submission and sticker scanning
   *
   * @param highAccuracy - Use high accuracy mode (default: true for receipt validation)
   * @returns Current location coordinates
   * @throws Error if location unavailable or permissions denied
   */
  async getCurrentLocation(
    highAccuracy: boolean = true
  ): Promise<LocationCoordinates> {
    // Check permissions first
    const permissions = await this.checkPermissions();
    if (!permissions.granted) {
      throw new Error(
        'Location permission denied. Please enable location access to submit receipts.'
      );
    }

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: highAccuracy
          ? Location.Accuracy.Highest
          : Location.Accuracy.High,
      });

      this.currentLocation = location;

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? undefined,
        altitude: location.coords.altitude,
        altitudeAccuracy: location.coords.altitudeAccuracy,
        heading: location.coords.heading,
        speed: location.coords.speed,
      };
    } catch (error) {
      console.error('Error getting current location:', error);
      throw new Error(
        'Unable to get your current location. Please ensure GPS is enabled and try again.'
      );
    }
  }

  /**
   * Get last known location (faster but may be outdated)
   */
  async getLastKnownLocation(): Promise<LocationCoordinates | null> {
    try {
      const location = await Location.getLastKnownPositionAsync();
      if (location) {
        this.currentLocation = location;
        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy ?? undefined,
          altitude: location.coords.altitude,
          altitudeAccuracy: location.coords.altitudeAccuracy,
          heading: location.coords.heading,
          speed: location.coords.speed,
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting last known location:', error);
      return null;
    }
  }

  /**
   * Start watching location changes in real-time
   * Useful for maps and venue discovery
   */
  async startWatchingLocation(
    callback: (coords: LocationCoordinates) => void
  ): Promise<void> {
    const permissions = await this.checkPermissions();
    if (!permissions.granted) {
      throw new Error('Location permission denied');
    }

    try {
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // Update every 5 seconds
          distanceInterval: 10, // Update every 10 meters
        },
        (location) => {
          this.currentLocation = location;
          callback({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy ?? undefined,
            altitude: location.coords.altitude,
            altitudeAccuracy: location.coords.altitudeAccuracy,
            heading: location.coords.heading,
            speed: location.coords.speed,
          });
        }
      );
    } catch (error) {
      console.error('Error watching location:', error);
      throw new Error('Unable to start location tracking');
    }
  }

  /**
   * Stop watching location changes
   */
  stopWatchingLocation(): void {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
  }

  /**
   * Validate if user is within allowed radius of a venue
   * CRITICAL: Enforces 60-meter requirement for receipt submissions
   *
   * @param venueLatitude - Venue's latitude
   * @param venueLongitude - Venue's longitude
   * @param radiusMeters - Maximum allowed radius (default: 60 meters)
   * @returns Validation result with distance and message
   */
  async validateProximityToVenue(
    venueLatitude: number,
    venueLongitude: number,
    radiusMeters: number = GPS_CONFIG.MAX_RADIUS_METERS
  ): Promise<GPSValidationResult> {
    // Get current location with high accuracy for validation
    const userLocation = await this.getCurrentLocation(true);

    // Validate coordinates
    if (
      !isValidCoordinates(userLocation.latitude, userLocation.longitude) ||
      !isValidCoordinates(venueLatitude, venueLongitude)
    ) {
      throw new Error('Invalid GPS coordinates');
    }

    // Validate proximity
    const validation = validateLocationProximity(
      { latitude: userLocation.latitude, longitude: userLocation.longitude },
      { latitude: venueLatitude, longitude: venueLongitude },
      radiusMeters
    );

    return {
      ...validation,
      userLocation,
      venueLocation: { latitude: venueLatitude, longitude: venueLongitude },
    };
  }

  /**
   * Calculate distance to venue from current location
   *
   * @param venueLatitude - Venue's latitude
   * @param venueLongitude - Venue's longitude
   * @returns Distance in meters
   */
  async getDistanceToVenue(
    venueLatitude: number,
    venueLongitude: number
  ): Promise<number> {
    const userLocation = await this.getCurrentLocation(false);

    return calculateDistanceBetweenCoords(
      { latitude: userLocation.latitude, longitude: userLocation.longitude },
      { latitude: venueLatitude, longitude: venueLongitude }
    );
  }

  /**
   * Get address from coordinates (reverse geocoding)
   */
  async getAddressFromCoordinates(
    latitude: number,
    longitude: number
  ): Promise<string> {
    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (addresses.length > 0) {
        const address = addresses[0];
        const parts = [
          address.street,
          address.streetNumber,
          address.city,
          address.region,
          address.country,
        ].filter(Boolean);
        return parts.join(', ');
      }

      return 'Unknown location';
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      return 'Unable to get address';
    }
  }

  /**
   * Get coordinates from address (forward geocoding)
   */
  async getCoordinatesFromAddress(
    address: string
  ): Promise<LocationCoordinates | null> {
    try {
      const results = await Location.geocodeAsync(address);

      if (results.length > 0) {
        return {
          latitude: results[0].latitude,
          longitude: results[0].longitude,
        };
      }

      return null;
    } catch (error) {
      console.error('Error geocoding address:', error);
      return null;
    }
  }

  /**
   * Check if location services are enabled on device
   */
  async isLocationEnabled(): Promise<boolean> {
    try {
      return await Location.hasServicesEnabledAsync();
    } catch (error) {
      console.error('Error checking location services:', error);
      return false;
    }
  }

  /**
   * Get cached current location (no network call)
   */
  getCachedLocation(): Location.LocationObject | null {
    return this.currentLocation;
  }

  /**
   * Clear cached location
   */
  clearCache(): void {
    this.currentLocation = null;
  }
}

// Export singleton instance
export default LocationService.getInstance();
