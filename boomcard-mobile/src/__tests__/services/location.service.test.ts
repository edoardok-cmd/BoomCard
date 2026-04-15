/**
 * Unit Tests: LocationService
 *
 * Uses the expo-location mock (__mocks__/expo-location.js).
 * Distance calculations use the real Haversine implementation.
 */

import * as Location from 'expo-location';
import { LocationService } from '../../services/location.service';

const mockRequestPerms = Location.requestForegroundPermissionsAsync as jest.Mock;
const mockCheckPerms = Location.getForegroundPermissionsAsync as jest.Mock;
const mockGetPosition = Location.getCurrentPositionAsync as jest.Mock;
const mockGetLastKnown = Location.getLastKnownPositionAsync as jest.Mock;
const mockWatch = Location.watchPositionAsync as jest.Mock;
const mockHasServices = Location.hasServicesEnabledAsync as jest.Mock;
const mockReverseGeocode = Location.reverseGeocodeAsync as jest.Mock;
const mockGeocode = Location.geocodeAsync as jest.Mock;

// Sofia centre coordinates for tests
const SOFIA = { latitude: 42.6977, longitude: 23.3219 };
// ~30m away from SOFIA (within 60m radius)
const NEAR_SOFIA = { latitude: 42.6979, longitude: 23.3222 };
// ~500m away from SOFIA (outside 60m radius)
const FAR_FROM_SOFIA = { latitude: 42.7020, longitude: 23.3280 };

function mockPosition(lat: number, lon: number) {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      accuracy: 5,
      altitude: 550,
      altitudeAccuracy: 1,
      heading: 0,
      speed: 0,
    },
    timestamp: Date.now(),
  };
}

describe('LocationService', () => {
  let service: LocationService;

  beforeEach(() => {
    LocationService.resetForTesting();
    service = LocationService.getInstance();
    jest.clearAllMocks();

    // Defaults: permissions granted, user at Sofia centre
    mockCheckPerms.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockRequestPerms.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockGetPosition.mockResolvedValue(mockPosition(SOFIA.latitude, SOFIA.longitude));
    mockGetLastKnown.mockResolvedValue(null);
    mockHasServices.mockResolvedValue(true);
  });

  // ─── Permissions ───────────────────────────────────────────────

  describe('requestPermissions', () => {
    it('should return granted when user accepts', async () => {
      const result = await service.requestPermissions();
      expect(result.granted).toBe(true);
      expect(result.status).toBe('granted');
    });

    it('should return denied when user rejects', async () => {
      mockRequestPerms.mockResolvedValue({ status: 'denied', canAskAgain: true });
      const result = await service.requestPermissions();
      expect(result.granted).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockRequestPerms.mockRejectedValue(new Error('fail'));
      const result = await service.requestPermissions();
      expect(result.granted).toBe(false);
      expect(result.status).toBe('error');
    });
  });

  describe('checkPermissions', () => {
    it('should return current permission status', async () => {
      const result = await service.checkPermissions();
      expect(result.granted).toBe(true);
    });
  });

  // ─── Current Location ─────────────────────────────────────────

  describe('getCurrentLocation', () => {
    it('should return coordinates when permission granted', async () => {
      const loc = await service.getCurrentLocation();
      expect(loc.latitude).toBe(SOFIA.latitude);
      expect(loc.longitude).toBe(SOFIA.longitude);
      expect(loc.accuracy).toBe(5);
    });

    it('should throw when permission denied', async () => {
      mockCheckPerms.mockResolvedValue({ status: 'denied', canAskAgain: true });
      await expect(service.getCurrentLocation()).rejects.toThrow(/permission denied/i);
    });

    it('should throw when GPS fails', async () => {
      mockGetPosition.mockRejectedValue(new Error('GPS failure'));
      await expect(service.getCurrentLocation()).rejects.toThrow(/unable to get/i);
    });
  });

  describe('getLastKnownLocation', () => {
    it('should return null when no cached position', async () => {
      const loc = await service.getLastKnownLocation();
      expect(loc).toBeNull();
    });

    it('should return coordinates when cached position exists', async () => {
      mockGetLastKnown.mockResolvedValue(mockPosition(SOFIA.latitude, SOFIA.longitude));
      const loc = await service.getLastKnownLocation();
      expect(loc?.latitude).toBe(SOFIA.latitude);
    });
  });

  // ─── 60-meter Proximity Validation ────────────────────────────

  describe('validateProximityToVenue', () => {
    it('should pass when user is within 60m of venue', async () => {
      // User at SOFIA, venue at NEAR_SOFIA (~30m away)
      const result = await service.validateProximityToVenue(
        NEAR_SOFIA.latitude,
        NEAR_SOFIA.longitude
      );
      expect(result.isValid).toBe(true);
      expect(result.distance).toBeLessThan(60);
    });

    it('should fail when user is farther than 60m from venue', async () => {
      // User at SOFIA, venue at FAR_FROM_SOFIA (~500m away)
      const result = await service.validateProximityToVenue(
        FAR_FROM_SOFIA.latitude,
        FAR_FROM_SOFIA.longitude
      );
      expect(result.isValid).toBe(false);
      expect(result.distance).toBeGreaterThan(60);
    });

    it('should throw on invalid coordinates', async () => {
      await expect(
        service.validateProximityToVenue(999, 999)
      ).rejects.toThrow(/invalid.*coordinates/i);
    });
  });

  describe('getDistanceToVenue', () => {
    it('should return distance in meters', async () => {
      const distance = await service.getDistanceToVenue(
        NEAR_SOFIA.latitude,
        NEAR_SOFIA.longitude
      );
      expect(typeof distance).toBe('number');
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(100); // ~30m expected
    });
  });

  // ─── Geocoding ────────────────────────────────────────────────

  describe('getAddressFromCoordinates', () => {
    it('should return formatted address string', async () => {
      const address = await service.getAddressFromCoordinates(42.6977, 23.3219);
      expect(address).toContain('Vitosha Blvd');
      expect(address).toContain('Sofia');
    });

    it('should return fallback on error', async () => {
      mockReverseGeocode.mockRejectedValue(new Error('Network'));
      const address = await service.getAddressFromCoordinates(42.6977, 23.3219);
      expect(address).toBe('Unable to get address');
    });
  });

  describe('getCoordinatesFromAddress', () => {
    it('should return coordinates for valid address', async () => {
      const coords = await service.getCoordinatesFromAddress('Sofia');
      expect(coords?.latitude).toBe(42.6977);
      expect(coords?.longitude).toBe(23.3219);
    });

    it('should return null when no results', async () => {
      mockGeocode.mockResolvedValue([]);
      const coords = await service.getCoordinatesFromAddress('Nowhere');
      expect(coords).toBeNull();
    });
  });

  // ─── Watch / Cache ────────────────────────────────────────────

  describe('isLocationEnabled', () => {
    it('should return true when services are on', async () => {
      expect(await service.isLocationEnabled()).toBe(true);
    });

    it('should return false when services are off', async () => {
      mockHasServices.mockResolvedValue(false);
      expect(await service.isLocationEnabled()).toBe(false);
    });
  });

  describe('cache', () => {
    it('should start with null cached location', () => {
      expect(service.getCachedLocation()).toBeNull();
    });

    it('should cache after getCurrentLocation', async () => {
      await service.getCurrentLocation();
      expect(service.getCachedLocation()).not.toBeNull();
    });

    it('should clear cache', async () => {
      await service.getCurrentLocation();
      service.clearCache();
      expect(service.getCachedLocation()).toBeNull();
    });
  });
});
