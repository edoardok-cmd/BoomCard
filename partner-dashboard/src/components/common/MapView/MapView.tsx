import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, X, Star, Clock, Phone, ExternalLink } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import Button from '../Button/Button';

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
    showList: 'Show List',
    showMap: 'Show Map',
  },
  bg: {
    enableLocation: 'Разреши Местоположение',
    locationDenied: 'Достъпът до местоположение е отказан',
    locationError: 'Не може да се намери местоположението',
    findNearby: 'Намери Близки Оферти',
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
    showList: 'Покажи Списък',
    showMap: 'Покажи Карта',
  },
};

export interface Venue {
  id: string;
  name: string;
  category: string;
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

const MapView: React.FC<MapViewProps> = ({
  venues,
  onVenueClick,
  initialCenter = { lat: 42.6977, lng: 23.3219 }, // Sofia, Bulgaria
  initialZoom = 12,
  showControls = true,
  height = '500px',
}) => {
  const { language } = useLanguage();
  const t = content[language as keyof typeof content];

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if geolocation is supported
    if ('geolocation' in navigator) {
      // Check permission status
      if ('permissions' in navigator) {
        navigator.permissions.query({ name: 'geolocation' }).then((result) => {
          setLocationPermission(result.state as 'granted' | 'denied' | 'prompt');
        });
      }
    }
  }, []);

  const requestLocation = () => {
    if ('geolocation' in navigator) {
      setIsLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(location);
          setMapCenter(location);
          setLocationPermission('granted');
          setIsLoading(false);
        },
        (error) => {
          console.error('Geolocation error:', error);
          setLocationPermission('denied');
          setIsLoading(false);

          if (error.code === error.PERMISSION_DENIED) {
            alert(t.locationDenied);
          } else {
            alert(t.locationError);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    }
  };

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
    onVenueClick?.(venue);
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 1, 18));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 1, 1));
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
      <MapContainer height={height}>
        {/* SVG Map Representation */}
        <svg width="100%" height="100%" viewBox={`0 0 800 600`}>
          {/* Background */}
          <rect width="800" height="600" fill="#f0f4f8" />

          {/* Grid lines for map feel */}
          {Array.from({ length: 20 }).map((_, i) => (
            <React.Fragment key={i}>
              <line
                x1={i * 40}
                y1="0"
                x2={i * 40}
                y2="600"
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1={i * 30}
                x2="800"
                y2={i * 30}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            </React.Fragment>
          ))}

          {/* User location marker */}
          {userLocation && (
            <g transform={`translate(400, 300)`}>
              <circle r="30" fill="rgba(59, 130, 246, 0.2)" />
              <circle r="20" fill="rgba(59, 130, 246, 0.4)" />
              <circle r="10" fill="#3b82f6" stroke="white" strokeWidth="3" />
              <text
                x="0"
                y="50"
                textAnchor="middle"
                fill="#3b82f6"
                fontSize="12"
                fontWeight="600"
              >
                {t.myLocation}
              </text>
            </g>
          )}

          {/* Venue markers */}
          {sortedVenues.map((venue, index) => {
            const angle = (index * (360 / venues.length) * Math.PI) / 180;
            const radius = 150 + (index % 3) * 50;
            const x = 400 + Math.cos(angle) * radius;
            const y = 300 + Math.sin(angle) * radius;

            return (
              <g
                key={venue.id}
                transform={`translate(${x}, ${y})`}
                onClick={() => handleVenueClick(venue)}
                style={{ cursor: 'pointer' }}
              >
                {/* Marker shadow */}
                <ellipse
                  cx="0"
                  cy="35"
                  rx="15"
                  ry="5"
                  fill="rgba(0,0,0,0.2)"
                />

                {/* Marker pin */}
                <path
                  d="M 0 -25 Q -15 -25 -15 -10 Q -15 5 0 25 Q 15 5 15 -10 Q 15 -25 0 -25 Z"
                  fill={selectedVenue?.id === venue.id ? '#ef4444' : '#111827'}
                  stroke="white"
                  strokeWidth="2"
                />

                {/* Inner circle */}
                <circle
                  r="8"
                  cy="-10"
                  fill="white"
                />

                {/* Pulse animation for selected */}
                {selectedVenue?.id === venue.id && (
                  <circle
                    r="20"
                    cy="-10"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    opacity="0.6"
                  >
                    <animate
                      attributeName="r"
                      from="15"
                      to="35"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      from="0.6"
                      to="0"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Venue name label */}
                <text
                  y="40"
                  textAnchor="middle"
                  fill="#111827"
                  fontSize="11"
                  fontWeight="600"
                  style={{ pointerEvents: 'none' }}
                >
                  {venue.name.length > 15 ? venue.name.substring(0, 15) + '...' : venue.name}
                </text>

                {/* Distance badge */}
                {userLocation && (
                  <g transform="translate(0, 55)">
                    <rect
                      x="-25"
                      y="-8"
                      width="50"
                      height="16"
                      rx="8"
                      fill="#10b981"
                    />
                    <text
                      textAnchor="middle"
                      y="4"
                      fill="white"
                      fontSize="9"
                      fontWeight="600"
                    >
                      {calculateDistance(userLocation.lat, userLocation.lng, venue.lat, venue.lng)} km
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Map controls */}
        {showControls && (
          <Controls>
            <ControlButton onClick={handleZoomIn} title={t.zoomIn}>
              +
            </ControlButton>
            <ControlButton onClick={handleZoomOut} title={t.zoomOut}>
              −
            </ControlButton>
            <ControlButton onClick={handleResetView} title={t.resetView}>
              ⟲
            </ControlButton>
          </Controls>
        )}

        {/* Location permission button */}
        {!userLocation && locationPermission !== 'denied' && (
          <LocationButton>
            <Button onClick={requestLocation} disabled={isLoading}>
              <Navigation size={18} />
              {isLoading ? t.loading : t.enableLocation}
            </Button>
          </LocationButton>
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
      </MapContainer>

      {/* Nearby venues list */}
      {userLocation && sortedVenues.length > 0 && (
        <VenuesList>
          <VenuesListHeader>
            {t.findNearby} ({sortedVenues.length})
          </VenuesListHeader>
          {sortedVenues.slice(0, 5).map((venue) => (
            <VenueListItem
              key={venue.id}
              onClick={() => handleVenueClick(venue)}
              isSelected={selectedVenue?.id === venue.id}
            >
              <VenueListIcon>
                <MapPin size={16} />
              </VenueListIcon>
              <VenueListInfo>
                <VenueListName>{venue.name}</VenueListName>
                <VenueListDistance>
                  {calculateDistance(userLocation.lat, userLocation.lng, venue.lat, venue.lng)} km •{' '}
                  {venue.category}
                </VenueListDistance>
              </VenueListInfo>
              {venue.discount && (
                <VenueListDiscount>{venue.discount}%</VenueListDiscount>
              )}
            </VenueListItem>
          ))}
        </VenuesList>
      )}
    </Container>
  );
};

const Container = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const MapContainer = styled.div<{ height: string }>`
  width: 100%;
  height: ${props => props.height};
  background: #f0f4f8;
  border-radius: 1rem;
  overflow: hidden;
  position: relative;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
`;

const Controls = styled.div`
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const ControlButton = styled.button`
  width: 40px;
  height: 40px;
  background: white;
  border: 2px solid var(--gray-200);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  &:hover {
    background: var(--gray-50);
    border-color: var(--primary);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const LocationButton = styled.div`
  position: absolute;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
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
  z-index: 10;

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

const VenuesList = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

const VenuesListHeader = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 1rem 0;
`;

const VenueListItem = styled.div<{ isSelected: boolean }>`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  background: ${props => (props.isSelected ? 'var(--gray-100)' : 'transparent')};

  &:hover {
    background: var(--gray-100);
  }

  & + & {
    margin-top: 0.5rem;
  }
`;

const VenueListIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--gray-100);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-secondary);
`;

const VenueListInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const VenueListName = styled.div`
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const VenueListDistance = styled.div`
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
`;

const VenueListDiscount = styled.div`
  background: var(--success);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
`;

export default MapView;
