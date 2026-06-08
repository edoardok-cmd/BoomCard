import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useLanguage } from '../../../contexts/LanguageContext';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue with bundlers (same approach as MapView).
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export interface Coordinates {
  latitude: number;
  longitude: number;
}

interface VenueLocationPickerProps {
  /** Address string to geocode when the user presses "Find on map". */
  address: string;
  /** City — appended to the geocode query to improve accuracy. */
  city?: string;
  /** Currently resolved coordinates (null until resolved). */
  value: Coordinates | null;
  /** Called whenever coordinates change (geocode result, map click, or drag). */
  onChange: (coords: Coordinates) => void;
  disabled?: boolean;
}

const content = {
  en: {
    findOnMap: 'Find on map',
    searching: 'Searching…',
    instructions:
      'Enter your address above, then press "Find on map". Click the map or drag the pin to fine-tune the exact location.',
    notFound: 'Could not find that address. Try adding more detail, or click the map to drop a pin manually.',
    enterAddress: 'Please enter an address and city first.',
    networkError: 'Could not reach the map service. Click the map to drop a pin manually.',
    resolved: 'Location set',
    coords: 'Coordinates',
  },
  bg: {
    findOnMap: 'Намери на картата',
    searching: 'Търсене…',
    instructions:
      'Въведете адреса по-горе и натиснете „Намери на картата“. Кликнете върху картата или преместете маркера, за да настроите точното местоположение.',
    notFound: 'Адресът не беше намерен. Добавете повече детайли или кликнете върху картата, за да поставите маркер ръчно.',
    enterAddress: 'Първо въведете адрес и град.',
    networkError: 'Картата не е достъпна в момента. Кликнете върху картата, за да поставите маркер ръчно.',
    resolved: 'Местоположението е зададено',
    coords: 'Координати',
  },
};

const SOFIA = { latitude: 42.6977, longitude: 23.3219 };

// Keep the map view in sync with the resolved coordinates.
const MapRecenter: React.FC<{ coords: Coordinates | null }> = ({ coords }) => {
  const map = useMap();
  useEffect(() => {
    if (coords) {
      map.setView([coords.latitude, coords.longitude], 16);
    }
  }, [coords, map]);
  return null;
};

// Capture clicks on the map to allow manual pin placement.
const ClickCapture: React.FC<{ onPick: (c: Coordinates) => void; disabled?: boolean }> = ({
  onPick,
  disabled,
}) => {
  useMapEvents({
    click: (e) => {
      if (disabled) return;
      onPick({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  return null;
};

const VenueLocationPicker: React.FC<VenueLocationPickerProps> = ({
  address,
  city,
  value,
  onChange,
  disabled,
}) => {
  const { language } = useLanguage();
  const t = content[language as keyof typeof content] ?? content.en;

  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Debounce guard so rapid clicks on "Find on map" don't spam Nominatim.
  const lastSearchRef = useRef<number>(0);

  const geocode = async () => {
    const now = Date.now();
    if (now - lastSearchRef.current < 1000) return; // 1s debounce (Nominatim usage policy)
    lastSearchRef.current = now;

    const query = [address.trim(), city?.trim()].filter(Boolean).join(', ');
    if (!query) {
      setMessage({ kind: 'error', text: t.enterAddress });
      return;
    }

    setSearching(true);
    setMessage(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        query,
      )}`;
      const res = await fetch(url, {
        headers: {
          // Identify the app per Nominatim usage policy.
          Accept: 'application/json',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Array<{ lat: string; lon: string }> = await res.json();
      if (!data.length) {
        setMessage({ kind: 'error', text: t.notFound });
        return;
      }
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        onChange({ latitude: lat, longitude: lon });
        setMessage(null);
      } else {
        setMessage({ kind: 'error', text: t.notFound });
      }
    } catch {
      setMessage({ kind: 'error', text: t.networkError });
    } finally {
      setSearching(false);
    }
  };

  const handleDragEnd = () => {
    const marker = markerRef.current;
    if (marker) {
      const pos = marker.getLatLng();
      onChange({ latitude: pos.lat, longitude: pos.lng });
    }
  };

  const center = value ?? SOFIA;

  return (
    <Wrapper>
      <SearchRow>
        <FindButton type="button" onClick={geocode} disabled={disabled || searching}>
          {searching ? t.searching : `📍 ${t.findOnMap}`}
        </FindButton>
        {value && (
          <Resolved>
            ✓ {t.resolved}: {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
          </Resolved>
        )}
      </SearchRow>

      <Instructions>{t.instructions}</Instructions>

      {message && <PickerMessage $error={message.kind === 'error'}>{message.text}</PickerMessage>}

      <MapShell aria-label={t.findOnMap}>
        <MapContainer
          center={[center.latitude, center.longitude]}
          zoom={value ? 16 : 12}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapRecenter coords={value} />
          <ClickCapture onPick={onChange} disabled={disabled} />
          {value && (
            <Marker
              position={[value.latitude, value.longitude]}
              draggable={!disabled}
              ref={markerRef}
              eventHandlers={{ dragend: handleDragEnd }}
            />
          )}
        </MapContainer>
      </MapShell>
    </Wrapper>
  );
};

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
`;

const FindButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover:not(:disabled) {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Resolved = styled.span`
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-success, #16a34a);
`;

const Instructions = styled.p`
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.4;
`;

const PickerMessage = styled.p<{ $error?: boolean }>`
  font-size: 0.8125rem;
  margin: 0;
  color: ${props => (props.$error ? 'var(--color-error)' : 'var(--color-text-secondary)')};
`;

const MapShell = styled.div`
  width: 100%;
  height: 300px;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid var(--color-border);

  .leaflet-container {
    font-family: inherit;
  }
`;

export default VenueLocationPicker;
