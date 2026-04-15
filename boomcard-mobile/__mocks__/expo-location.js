module.exports = {
  Accuracy: {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
    BestForNavigation: 6,
  },
  requestForegroundPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    canAskAgain: true,
  })),
  getForegroundPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    canAskAgain: true,
  })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: {
      latitude: 42.6977,
      longitude: 23.3219,
      accuracy: 5,
      altitude: 550,
      altitudeAccuracy: 1,
      heading: 0,
      speed: 0,
    },
    timestamp: Date.now(),
  })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  reverseGeocodeAsync: jest.fn(async () => [
    {
      street: 'Vitosha Blvd',
      streetNumber: '1',
      city: 'Sofia',
      region: 'Sofia',
      country: 'Bulgaria',
    },
  ]),
  geocodeAsync: jest.fn(async () => [
    { latitude: 42.6977, longitude: 23.3219 },
  ]),
};
