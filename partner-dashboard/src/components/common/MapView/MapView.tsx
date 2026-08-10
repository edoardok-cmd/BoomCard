import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, X, Star, Clock, Phone, ExternalLink } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useUserLocation } from '../../../contexts/LocationContext';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue with bundlers
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const content = {
  en: {
    enableLocation: 'Enable Location',
    locationDenied: 'Location access denied',
    locationError: 'Unable to get your location',
    findNearby: 'Find Nearby Offers',
    myLocation: 'My Location',
    distance: 'away',
    openNow: 'Open Now',
    closed: 'Closed',
    viewDetails: 'View Details',
    getDirections: 'Get Directions',
    call: 'Call',
    noVenues: 'No venues found in this area',
    loading: 'Loading map...',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    resetView: 'Reset View',
  },
  bg: {
    enableLocation: 'Разреши Местоположение',
    locationDenied: 'Достъпът до местоположение е отказан',
    locationError: 'Не може да се намери местоположението',
    findNearby: 'Намери Близки Отстъпки',
    myLocation: 'Моето Местоположение',
    distance: 'разстояние',
    openNow: 'Отворено Сега',
    closed: 'Затворено',
    viewDetails: 'Виж Детайли',
    getDirections: 'Упътвания',
    call: 'Обади се',
    noVenues: 'Няма намерени места в този район',
    loading: 'Зареждане на карта...',
    zoomIn: 'Увеличи',
    zoomOut: 'Намали',
    resetView: 'Нулирай',
  },
};

export interface Venue {
  id: string;
  name: string;
  /** Raw category ID (e.g. "food-drink/restaurants"). Not shown directly. */
  category: string;
  /** Human-readable, already-translated category label for popups. */
  categoryLabel?: string;
  lat: number;
  lng: number;
  address: string;
  phone?: string;
  rating?: number;
  isOpen?: boolean;
  image?: string;
  discount?: number;
}

interface MapViewProps {
  venues: Venue[];
  onVenueClick?: (venue: Venue) => void;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  showControls?: boolean;
  height?: string;
}

// Custom marker icons
const createCustomIcon = (color: string, isSelected: boolean) => {
  const size = isSelected ? 35 : 25;
  const svg = `
    <svg width="${size}" height="${size * 1.2}" viewBox="0 0 24 29" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 7.2 12 17 12 17s12-9.8 12-17c0-6.6-5.4-12-12-12z"
            fill="${color}"
            stroke="white"
            stroke-width="2"/>
      <circle cx="12" cy="11" r="4" fill="white"/>
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: 'custom-marker',
    iconSize: [size, size * 1.2],
    iconAnchor: [size / 2, size * 1.2],
    popupAnchor: [0, -size * 1.2],
  });
};

const userLocationIcon = L.divIcon({
  html: `
    <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
      <circle cx="15" cy="15" r="14" fill="rgba(59, 130, 246, 0.2)" stroke="none"/>
      <circle cx="15" cy="15" r="10" fill="rgba(59, 130, 246, 0.4)" stroke="none"/>
      <circle cx="15" cy="15" r="6" fill="#3b82f6" stroke="white" stroke-width="3"/>
    </svg>
  `,
  className: 'user-location-marker',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// Component to handle map updates
const MapUpdater: React.FC<{ center: { lat: number; lng: number }; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], zoom);
  }, [center, zoom, map]);
  return null;
};

const MapView: React.FC<MapViewProps> = ({
  venues,
  onVenueClick,
  initialCenter = { lat: 42.6977, lng: 23.3219 }, // Sofia, Bulgaria
  initialZoom = 13,
  showControls = true,
  height = '500px',
}) => {
  const { language } = useLanguage();
  const t = content[language as keyof typeof content];

  const { userCoords } = useUserLocation();
  const userLocation = userCoords ?? null;

  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(
    userCoords ?? initialCenter
  );
  const [zoom, setZoom] = useState<number>(initialZoom);

  // Recenter when the shared user location changes (first grant or cross-page reuse)
  useEffect(() => {
    if (userCoords) setMapCenter(userCoords);
  }, [userCoords]);

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Radius of the Earth in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return Math.round(distance * 10) / 10; // Round to 1 decimal
  };

  const handleVenueClick = (venue: Venue) => {
    setSelectedVenue(venue);
    setMapCenter({ lat: venue.lat, lng: venue.lng });
    setZoom(16);
    onVenueClick?.(venue);
  };

  const handleResetView = () => {
    setMapCenter(userLocation || initialCenter);
    setZoom(initialZoom);
    setSelectedVenue(null);
  };

  const getDirectionsUrl = (venue: Venue) => {
    if (userLocation) {
      return `https://www.google.com/maps/dir/${userLocation.lat},${userLocation.lng}/${venue.lat},${venue.lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`;
  };

  // Sort venues by distance if user location is available
  const sortedVenues = userLocation
    ? [...venues].sort((a, b) => {
        const distA = calculateDistance(userLocation.lat, userLocation.lng, a.lat, a.lng);
        const distB = calculateDistance(userLocation.lat, userLocation.lng, b.lat, b.lng);
        return distA - distB;
      })
    : venues;

  return (
    <Container>
      <StyledMapContainer height={height}>
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={zoom}
          style={{ height: '100%', width: '100%', borderRadius: '1rem' }}
          zoomControl={false}
        >
          <MapUpdater center={mapCenter} zoom={zoom} />

          {/* OpenStreetMap tiles */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* User location marker */}
          {userLocation && (
            <>
              <Circle
                center={[userLocation.lat, userLocation.lng]}
                radius={500}
                pathOptions={{
                  fillColor: 'rgba(59, 130, 246, 0.1)',
                  fillOpacity: 0.4,
                  color: '#3b82f6',
                  weight: 2,
                }}
              />
              <Marker
                position={[userLocation.lat, userLocation.lng]}
                icon={userLocationIcon}
              >
                <Popup>{t.myLocation}</Popup>
              </Marker>
            </>
          )}

          {/* Venue markers */}
          {sortedVenues.map((venue) => (
            <Marker
              key={venue.id}
              position={[venue.lat, venue.lng]}
              icon={createCustomIcon(
                selectedVenue?.id === venue.id ? '#ef4444' : '#111827',
                selectedVenue?.id === venue.id
              )}
              eventHandlers={{
                click: () => handleVenueClick(venue),
              }}
            >
              <Popup>
                <PopupContent>
                  <PopupTitle>{venue.name}</PopupTitle>
                  {venue.categoryLabel && (
                    <PopupCategory>{venue.categoryLabel}</PopupCategory>
                  )}
                  {venue.discount && (
                    <PopupDiscount>{venue.discount}% OFF</PopupDiscount>
                  )}
                  <PopupAddress>{venue.address}</PopupAddress>
                  {userLocation && (
                    <PopupDistance>
                      {calculateDistance(
                        userLocation.lat,
                        userLocation.lng,
                        venue.lat,
                        venue.lng
                      )}{' '}
                      km {t.distance}
                    </PopupDistance>
                  )}
                </PopupContent>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Reset view button */}
        {showControls && (userLocation || selectedVenue) && (
          <ResetButton onClick={handleResetView}>
            <span>⟲</span>
            <span>{t.resetView}</span>
          </ResetButton>
        )}

        {/* Selected venue info card */}
        <AnimatePresence>
          {selectedVenue && (
            <VenueCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <CloseButton onClick={() => setSelectedVenue(null)}>
                <X size={18} />
              </CloseButton>

              {selectedVenue.image && (
                <VenueImage src={selectedVenue.image} alt={selectedVenue.name} />
              )}

              <VenueInfo>
                <VenueName>{selectedVenue.name}</VenueName>

                {selectedVenue.rating && (
                  <VenueRating>
                    <Star size={14} fill="#fbbf24" stroke="#fbbf24" />
                    <span>{selectedVenue.rating.toFixed(1)}</span>
                  </VenueRating>
                )}

                <VenueAddress>
                  <MapPin size={14} />
                  {selectedVenue.address}
                </VenueAddress>

                {userLocation && (
                  <VenueDistance>
                    {calculateDistance(
                      userLocation.lat,
                      userLocation.lng,
                      selectedVenue.lat,
                      selectedVenue.lng
                    )}{' '}
                    km {t.distance}
                  </VenueDistance>
                )}

                {selectedVenue.isOpen !== undefined && (
                  <VenueStatus isOpen={selectedVenue.isOpen}>
                    <Clock size={14} />
                    {selectedVenue.isOpen ? t.openNow : t.closed}
                  </VenueStatus>
                )}

                {selectedVenue.discount && (
                  <DiscountBadge>{selectedVenue.discount}% OFF</DiscountBadge>
                )}

                <VenueActions>
                  <ActionButton
                    onClick={() => onVenueClick?.(selectedVenue)}
                  >
                    {t.viewDetails}
                  </ActionButton>

                  <ActionButton
                    as="a"
                    href={getDirectionsUrl(selectedVenue)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={14} />
                    {t.getDirections}
                  </ActionButton>

                  {selectedVenue.phone && (
                    <ActionButton
                      as="a"
                      href={`tel:${selectedVenue.phone}`}
                    >
                      <Phone size={14} />
                      {t.call}
                    </ActionButton>
                  )}
                </VenueActions>
              </VenueInfo>
            </VenueCard>
          )}
        </AnimatePresence>
      </StyledMapContainer>
    </Container>
  );
};

const Container = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const StyledMapContainer = styled.div<{ height: string }>`
  width: 100%;
  height: ${props => props.height};
  position: relative;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-radius: 1rem;
  overflow: hidden;

  .leaflet-container {
    font-family: inherit;
  }

  .leaflet-popup-content-wrapper {
    border-radius: 0.75rem;
    padding: 0;
  }

  .leaflet-popup-content {
    margin: 0;
  }

  .custom-marker {
    border: none !important;
    background: none !important;
  }

  .user-location-marker {
    border: none !important;
    background: none !important;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
`;

const ResetButton = styled.button`
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: white;
  border: 2px solid var(--gray-200);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 1000;

  span:first-child {
    font-size: 1.25rem;
  }

  &:hover {
    background: var(--gray-50);
    border-color: var(--primary);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const PopupContent = styled.div`
  padding: 0.75rem;
  min-width: 200px;
`;

const PopupTitle = styled.div`
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
`;

const PopupCategory = styled.div`
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
`;

const PopupDiscount = styled.div`
  display: inline-block;
  background: var(--success);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
`;

const PopupAddress = styled.div`
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
`;

const PopupDistance = styled.div`
  font-size: 0.75rem;
  color: var(--success);
  font-weight: 600;
`;

const VenueCard = styled(motion.div)`
  position: absolute;
  bottom: 1.5rem;
  left: 1.5rem;
  right: 1.5rem;
  max-width: 400px;
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  z-index: 1000;

  @media (max-width: 768px) {
    left: 1rem;
    right: 1rem;
    max-width: none;
  }
`;

const CloseButton = styled.button`
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 2;

  &:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: scale(1.1);
  }
`;

const VenueImage = styled.img`
  width: 100%;
  height: 150px;
  object-fit: cover;
`;

const VenueInfo = styled.div`
  padding: 1rem;
`;

const VenueName = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
`;

const VenueRating = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
`;

const VenueAddress = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;

  svg {
    flex-shrink: 0;
  }
`;

const VenueDistance = styled.div`
  font-size: 0.875rem;
  color: var(--success);
  font-weight: 600;
  margin-bottom: 0.5rem;
`;

const VenueStatus = styled.div<{ isOpen: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => (props.isOpen ? 'var(--success)' : 'var(--error)')};
  margin-bottom: 0.75rem;
`;

const DiscountBadge = styled.div`
  display: inline-block;
  background: var(--success);
  color: white;
  padding: 0.375rem 0.75rem;
  border-radius: 2rem;
  font-size: 0.875rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
`;

const VenueActions = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  flex: 1;
  min-width: 100px;
  padding: 0.5rem 0.75rem;
  background: var(--gray-100);
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  text-decoration: none;

  &:hover {
    background: var(--gray-200);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
`;

export default MapView;
