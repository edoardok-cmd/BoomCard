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
  /**
   * Called after a reverse-geocode (pin dragged or map clicked) resolves an
   * address. Lets the parent keep the typed address/city fields in sync with
   * the pin so the two never silently disagree.
   */
  onAddressResolved?: (fields: { address: string; city: string }) => void;
  disabled?: boolean;
}

const content = {
  en: {
    findOnMap: 'Find on map',
    searching: 'Searching…',
    instructions:
      'The pin updates automatically shortly after you type your address above (or press "Find on map" right away). Click the map or drag the pin to fine-tune the exact location — the address fields will update to match.',
    notFound: 'Could not find that address. Try adding more detail, or click the map to drop a pin manually.',
    enterAddress: 'Please enter an address and city first.',
    networkError: 'Could not reach the map service. Click the map to drop a pin manually.',
    resolved: 'Location set',
    coords: 'Coordinates',
    rateLimited: 'One moment — please wait a second and try again.',
  },
  bg: {
    findOnMap: 'Намери на картата',
    searching: 'Търсене…',
    instructions:
      'Маркерът се обновява автоматично малко след като въведете адреса по-горе (или натиснете „Намери на картата“ веднага). Кликнете върху картата или преместете маркера, за да настроите точното местоположение — полетата с адрес ще се обновят.',
    notFound: 'Адресът не беше намерен. Добавете повече детайли или кликнете върху картата, за да поставите маркер ръчно.',
    enterAddress: 'Първо въведете адрес и град.',
    networkError: 'Картата не е достъпна в момента. Кликнете върху картата, за да поставите маркер ръчно.',
    resolved: 'Местоположението е зададено',
    coords: 'Координати',
    rateLimited: 'Момент — изчакайте секунда и опитайте отново.',
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
  onAddressResolved,
  disabled,
}) => {
  const { language } = useLanguage();
  const t = content[language as keyof typeof content] ?? content.en;

  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Shared rate-limit guard for BOTH forward (search) and reverse (pin →
  // address) Nominatim calls — one request per second max, per their usage
  // policy, regardless of which direction triggered it.
  const lastSearchRef = useRef<number>(0);

  // When we ourselves push a reverse-geocoded address into the parent's
  // fields, that address change would otherwise immediately re-trigger the
  // reactive forward-geocode effect below and could snap the pin away from
  // where the user just dropped it. We record the EXACT value we pushed here
  // and compare it against the current address/city props (rather than using
  // a bare boolean flag that assumes the effect will always re-fire): if the
  // resolved text happens to be identical to what's already typed, the props
  // never change and a boolean would stay stuck armed forever, silently
  // swallowing the user's next real edit. Comparing values instead means the
  // guard only ever suppresses the specific self-write it recorded — the
  // very next genuine edit (which necessarily differs from the recorded
  // value, or is a no-op if it doesn't) is never incorrectly skipped.
  const lastPushedRef = useRef<{ address: string; city: string } | null>(null);

  // Debounce timer for reactive (address-typed) geocoding.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Skip the very first run of the reactive effect when coordinates are
  // already populated on mount (e.g. a future edit flow pre-filling a saved
  // location) — only react to subsequent address/city edits, not the mount
  // itself.
  const didMountRef = useRef(false);

  // Mirrors the `disabled` prop into a ref so timer callbacks scheduled by
  // the reactive effect (below) can read its CURRENT value at fire time
  // rather than the value captured in the closure when the timer was
  // scheduled. A form can go from enabled to disabled (submit-in-progress)
  // during the 900ms debounce window / the shared rate-limit requeue delay,
  // and a stale closure would fire performGeocode('auto') — and thus
  // onChange/setCoordinates — mid-submission regardless.
  const disabledRef = useRef(disabled);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const performGeocode = async (source: 'button' | 'auto') => {
    const query = [address.trim(), city?.trim()].filter(Boolean).join(', ');
    if (!query) {
      if (source === 'button') setMessage({ kind: 'error', text: t.enterAddress });
      return;
    }
    // Reactive geocoding: don't bother Nominatim over a couple of characters
    // while the user is still typing.
    if (source === 'auto' && query.length < 5) return;

    const now = Date.now();
    const elapsed = now - lastSearchRef.current;
    if (elapsed < 1000) {
      // Within the 1s Nominatim usage-policy window.
      if (source === 'button') {
        // A manual press must not just silently no-op — tell the user why
        // nothing happened.
        setMessage({ kind: 'info', text: t.rateLimited });
      } else {
        // Don't drop the reactive request on the floor: requeue it to fire
        // once the rate-limit window clears, in case this was the user's
        // last edit and there's no next debounced change to retry on.
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          if (disabledRef.current) return;
          void performGeocode('auto');
        }, 1000 - elapsed + 50);
      }
      return;
    }
    lastSearchRef.current = now;

    setSearching(true);
    if (source === 'button') setMessage(null);
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

  // Reactively re-geocode whenever the typed address/city change, so the pin
  // follows what's typed instead of only moving on an explicit button press.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      if (value) {
        // Coordinates already exist on mount (e.g. pre-filled from a saved
        // location) — don't fire an auto-geocode against them on load, only
        // react to subsequent edits.
        return;
      }
    }
    if (
      lastPushedRef.current &&
      lastPushedRef.current.address === address &&
      lastPushedRef.current.city === (city ?? '')
    ) {
      // This change (or non-change) matches exactly what we ourselves just
      // wrote back into the parent via a reverse-geocode — don't immediately
      // re-geocode it, that would fight the pin the user just placed. Clear
      // it so it only ever suppresses this one specific value.
      lastPushedRef.current = null;
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      // Read the CURRENT disabled state, not the value captured when this
      // timer was scheduled — see disabledRef's own comment above.
      if (disabledRef.current) return;
      void performGeocode('auto');
    }, 900);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, city]);

  const reverseGeocode = async (coords: Coordinates) => {
    const now = Date.now();
    if (now - lastSearchRef.current < 1000) return; // respect shared rate limit
    lastSearchRef.current = now;

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: {
        display_name?: string;
        address?: Record<string, string>;
        error?: string;
      } = await res.json();
      if (!data || data.error || !onAddressResolved) return;

      const addr = data.address ?? {};
      const road = [addr.road, addr.house_number].filter(Boolean).join(' ');
      const cityName = addr.city || addr.town || addr.village || addr.municipality || '';
      const resolvedAddress = road || data.display_name || '';
      if (!resolvedAddress && !cityName) return; // nothing usable came back

      const finalAddress = resolvedAddress || address;
      const finalCity = cityName || city || '';
      lastPushedRef.current = { address: finalAddress, city: finalCity };
      onAddressResolved({ address: finalAddress, city: finalCity });
    } catch {
      // Reverse geocode failing is non-fatal: the coordinates (already set
      // via onChange) remain the source of truth for the pin. We just can't
      // sync the text fields this time — no crash, no stale error state.
    }
  };

  const handleDragEnd = () => {
    const marker = markerRef.current;
    if (marker) {
      // Defense-in-depth against a pending reactive-geocode debounce (or
      // rate-limit requeue) firing after this manual correction and
      // silently snapping the pin back — cancel it outright, independent of
      // whether the reverse-geocode below resolves to text that would have
      // reset it naturally.
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      const pos = marker.getLatLng();
      const coords = { latitude: pos.lat, longitude: pos.lng };
      onChange(coords);
      setMessage(null); // Clear error when location is set via drag
      void reverseGeocode(coords);
    }
  };

  const handleMapClick = (coords: Coordinates) => {
    // See comment in handleDragEnd: cancel any pending debounced/requeued
    // reactive geocode so it can't overwrite this manual placement.
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    onChange(coords);
    setMessage(null); // Clear error when location is set via map click
    void reverseGeocode(coords);
  };

  const center = value ?? SOFIA;

  return (
    <Wrapper>
      <SearchRow>
        <FindButton
          type="button"
          onClick={() => void performGeocode('button')}
          disabled={disabled || searching}
        >
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
          <ClickCapture onPick={handleMapClick} disabled={disabled} />
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
