import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import VenueLocationPicker from './VenueLocationPicker';

// react-leaflet renders real map/canvas machinery that jsdom can't support,
// and this suite is only exercising the debounce / reverse-geocode timing
// logic — so we replace it with a minimal stand-in that (a) renders its
// children so MapRecenter/ClickCapture mount, (b) exposes a fake marker ref
// with a controllable getLatLng(), and (c) captures the click handler that
// ClickCapture registers via useMapEvents so tests can simulate a manual
// map click / drag without real mouse events.
const leafletState: {
  latLng: { lat: number; lng: number };
  clickHandler: ((e: { latlng: { lat: number; lng: number } }) => void) | null;
} = {
  latLng: { lat: 42.0, lng: 23.0 },
  clickHandler: null,
};

vi.mock('react-leaflet', () => {
  const MapContainer = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const TileLayer = () => null;
  const Marker = React.forwardRef<{ getLatLng: () => { lat: number; lng: number } }, {
    eventHandlers?: { dragend?: () => void };
  }>((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      getLatLng: () => leafletState.latLng,
    }));
    return (
      <button
        type="button"
        data-testid="marker"
        onClick={() => props.eventHandlers?.dragend?.()}
      />
    );
  });
  const useMap = () => ({ setView: vi.fn() });
  const useMapEvents = (handlers: { click: (e: { latlng: { lat: number; lng: number } }) => void }) => {
    leafletState.clickHandler = handlers.click;
    return null;
  };
  return { MapContainer, TileLayer, Marker, useMap, useMapEvents };
});

const renderPicker = (props: Partial<React.ComponentProps<typeof VenueLocationPicker>> = {}) => {
  const onChange = vi.fn();
  const onAddressResolved = vi.fn();
  const defaultProps: React.ComponentProps<typeof VenueLocationPicker> = {
    address: '',
    city: '',
    value: null,
    onChange,
    onAddressResolved,
    ...props,
  };
  const utils = render(
    <LanguageProvider>
      <VenueLocationPicker {...defaultProps} />
    </LanguageProvider>,
  );
  return { ...utils, onChange, onAddressResolved };
};

const mockGeocodeSearchResponse = (lat: string, lon: string) => ({
  ok: true,
  json: async () => [{ lat, lon }],
});

const mockReverseGeocodeResponse = (road: string, city: string, displayName?: string) => ({
  ok: true,
  json: async () => ({
    display_name: displayName ?? `${road}, ${city}`,
    address: { road, city },
  }),
});

describe('VenueLocationPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    leafletState.latLng = { lat: 42.0, lng: 23.0 };
    leafletState.clickHandler = null;
    global.fetch = vi.fn();
    // Domain-based language detection defaults to 'bg' under jsdom's default
    // localhost origin; pin 'en' so assertions can target stable English copy.
    window.localStorage.setItem('boomcard_language', 'en');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    renderPicker();
    expect(screen.getByLabelText('Find on map')).toBeInTheDocument();
  });

  it('coalesces multiple rapid address changes into a single debounced geocode call', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockGeocodeSearchResponse('42.1', '23.1'),
    );

    const { rerender, onChange } = renderPicker({ address: 'Vitosha' });
    const props = {
      city: '',
      value: null,
      onAddressResolved: vi.fn(),
    };

    // Simulate several keystrokes in quick succession, each well within the
    // 900ms debounce window.
    for (const address of ['Vitosha B', 'Vitosha Bl', 'Vitosha Blvd 1']) {
      rerender(
        <LanguageProvider>
          <VenueLocationPicker address={address} onChange={onChange} {...props} />
        </LanguageProvider>,
      );
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
    }

    // Not yet fired — still inside the debounce window since the last edit.
    expect(global.fetch).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    // Exactly one geocode call for the whole burst of edits.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ latitude: 42.1, longitude: 23.1 });
  });

  it('resets the reverse-geocode skip-guard even when the resolved text matches what is already typed (HIGH-1 regression)', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    // The reverse-geocode from the manual click resolves to text IDENTICAL
    // to what's already in the address/city props — the scenario that used
    // to leave the old boolean skip-guard stuck armed forever.
    fetchMock.mockResolvedValueOnce(mockReverseGeocodeResponse('Vitosha Blvd 1', 'Sofia'));

    const onChange = vi.fn();
    const onAddressResolved = vi.fn();
    const { rerender } = render(
      <LanguageProvider>
        <VenueLocationPicker
          address="Vitosha Blvd 1"
          city="Sofia"
          value={{ latitude: 42.0, longitude: 23.0 }}
          onChange={onChange}
          onAddressResolved={onAddressResolved}
        />
      </LanguageProvider>,
    );

    // Manual map click triggers a reverse-geocode.
    await act(async () => {
      leafletState.clickHandler?.({ latlng: { lat: 42.05, lng: 23.05 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onAddressResolved).toHaveBeenCalledWith({ address: 'Vitosha Blvd 1', city: 'Sofia' });

    // Address/city props are unchanged (identical resolved text) — simulate
    // the parent re-rendering with the same values, which under the old
    // boolean-flag implementation would have left the guard permanently
    // armed without ever consuming it.
    rerender(
      <LanguageProvider>
        <VenueLocationPicker
          address="Vitosha Blvd 1"
          city="Sofia"
          value={{ latitude: 42.05, longitude: 23.05 }}
          onChange={onChange}
          onAddressResolved={onAddressResolved}
        />
      </LanguageProvider>,
    );

    // Now the user makes a genuine edit — this must NOT be silently
    // swallowed by a stuck guard.
    fetchMock.mockResolvedValue(mockGeocodeSearchResponse('42.2', '23.2'));
    rerender(
      <LanguageProvider>
        <VenueLocationPicker
          address="Vitosha Blvd 2"
          city="Sofia"
          value={{ latitude: 42.05, longitude: 23.05 }}
          onChange={onChange}
          onAddressResolved={onAddressResolved}
        />
      </LanguageProvider>,
    );

    // Advance well past both the 900ms debounce and the shared 1s
    // rate-limit window (the reverse-geocode above already consumed a slot),
    // including its requeue margin, so the auto-geocode has a chance to fire.
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith({ latitude: 42.2, longitude: 23.2 });
  });

  it('suppresses the reactive forward-geocode when a changed address prop matches what we just reverse-geocoded (skip-guard match branch)', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    // The reverse-geocode from the manual click resolves to text that
    // DIFFERS from what's currently typed — this is the case the old test
    // suite never exercised, because every existing test's "resolved" text
    // was already identical to the mounted address, so the address prop
    // never actually changed across a rerender and the guard's match branch
    // (VenueLocationPicker.tsx match clause) never even ran.
    fetchMock.mockResolvedValueOnce(mockReverseGeocodeResponse('52 Vitosha Blvd', 'Sofia'));

    const onChange = vi.fn();
    const onAddressResolved = vi.fn();
    // Mount with a non-null value so the mount-time run of the reactive
    // effect takes its early-return branch and does NOT itself schedule a
    // debounce timer / fire a /search call — isolates this test to just the
    // guard behaviour under audit.
    const { rerender } = render(
      <LanguageProvider>
        <VenueLocationPicker
          address="Vitosha Bl"
          city="Sofia"
          value={{ latitude: 42.0, longitude: 23.0 }}
          onChange={onChange}
          onAddressResolved={onAddressResolved}
        />
      </LanguageProvider>,
    );

    // Manual map click triggers a reverse-geocode that resolves to text
    // different from the currently-typed address.
    await act(async () => {
      leafletState.clickHandler?.({ latlng: { lat: 42.05, lng: 23.05 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onAddressResolved).toHaveBeenCalledWith({ address: '52 Vitosha Blvd', city: 'Sofia' });

    // Simulate the parent (RegisterPartnerPage) propagating the resolved
    // address back down as a genuinely CHANGED prop — this is what makes the
    // reactive effect's dependency array ([address, city]) actually re-run,
    // which is the precondition for the guard's match branch to execute at
    // all.
    fetchMock.mockClear();
    rerender(
      <LanguageProvider>
        <VenueLocationPicker
          address="52 Vitosha Blvd"
          city="Sofia"
          value={{ latitude: 42.05, longitude: 23.05 }}
          onChange={onChange}
          onAddressResolved={onAddressResolved}
        />
      </LanguageProvider>,
    );

    // Advance well past the 900ms debounce window. If the guard correctly
    // suppressed this self-write, no forward-geocode (/search) call fires.
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    const searchCalls = fetchMock.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('/search'),
    );
    expect(searchCalls).toHaveLength(0);
  });

  it('cancels a pending debounced auto-geocode when the pin is manually dragged/clicked (HIGH-2 regression)', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    // If the stale debounce timer survives and fires, it would resolve to
    // this address's coordinates and snap the pin back — the bug under test.
    fetchMock.mockResolvedValue(mockGeocodeSearchResponse('42.9', '23.9'));

    const onChange = vi.fn();
    const onAddressResolved = vi.fn();
    // Mount with value: null so the reactive effect's own mount-time run
    // (didMountRef false, value falsy) does NOT take the mount-guard's
    // early-return branch — it falls through and genuinely schedules the
    // 900ms debounce timer via setTimeout, giving us a real pending timer
    // to race against the manual click below. (Mounting with a non-null
    // value, as the original version of this test did, hits the mount
    // guard's early return and the effect never runs again without a
    // subsequent address-prop change via rerender — so debounceTimerRef
    // stays null for the test's whole lifetime and the clearTimeout calls
    // under test are exercised as no-ops either way.)
    render(
      <LanguageProvider>
        <VenueLocationPicker
          address="Original Address 1"
          city="Sofia"
          value={null}
          onChange={onChange}
          onAddressResolved={onAddressResolved}
        />
      </LanguageProvider>,
    );

    // The mount-time effect run has scheduled the 900ms debounced
    // auto-geocode. Advance partway through — still well within the
    // window, so the timer is genuinely still pending.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(global.fetch).not.toHaveBeenCalled();

    // Within the debounce window, the user manually clicks the map to
    // place/correct the pin.
    leafletState.latLng = { lat: 41.5, lng: 22.5 };
    await act(async () => {
      leafletState.clickHandler?.({ latlng: { lat: 41.5, lng: 22.5 } });
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith({ latitude: 41.5, longitude: 22.5 });
    onChange.mockClear();

    // Advance well past the original 900ms debounce window (and the 1s
    // rate-limit window). The stale timer must NOT have survived to fire a
    // forward-geocode that overwrites the manual correction.
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onChange).not.toHaveBeenCalledWith({ latitude: 42.9, longitude: 23.9 });
  });
});
