/**
 * Address utility helpers — pure functions, no React dependency.
 * Kept separate so they can be imported by Playwright spec files without
 * pulling in JSX/styled-components.
 */

/**
 * Extracts a house/building number from a Nominatim address object and, as a
 * last resort, from the first segment of the display_name string.
 *
 * Design decisions (BC-VENUE-FINDER-STREET-NUMBER-030 impl-r2):
 * - MEDIUM-1: trailing digit tried first; a leading digit followed by more text
 *   (e.g. "9 Септември") is treated as part of the street name, not a number.
 * - MEDIUM-2: `block` excluded — in Bulgarian Nominatim data it carries
 *   quarter/neighbourhood names ("кв. Лозенец"), not building numbers.
 * - MEDIUM-3: regex uses [\wЀ-ӿ] so Cyrillic letter suffixes ("84А") are kept.
 */
export function extractHouseNumber(
  address: {
    house_number?: string;
    street_number?: string;
    block?: string;
    building?: string;
  },
  displayName: string,
): string | undefined {
  if (address.house_number) return address.house_number;
  if (address.street_number) return address.street_number;
  // `block` intentionally skipped — carries quarter/neighbourhood names in BG.
  // `building` only used when the value starts with a digit (e.g. "7", "12A").
  // Named buildings like "Мол Парадайс" or "Сграда 7" are NOT house numbers.
  if (address.building && /^\d/.test(address.building)) return address.building;

  // Last resort: parse comma-segments of display_name in order.
  // Skip every leading segment that is a bare postal code (purely numeric,
  // 1–6 digits).  A single-step skip was insufficient when Nominatim returns
  // two consecutive postal-code segments (e.g. "1000, 2000, ул. X 15, BG").
  const segments = displayName.split(',');
  let segIdx = 0;
  while (segIdx < segments.length - 1 && /^\d{1,6}$/.test(segments[segIdx].trim())) {
    segIdx++;
  }
  const segment = (segments[segIdx] ?? '').trim();

  // If every segment was a bare postal code (loop exhausted non-postal content),
  // the selected segment itself is still a postal code — do not extract it as a
  // house number.
  if (/^\d{1,6}$/.test(segment)) return undefined;

  // Try trailing digit sequence first (Bulgarian convention: "ул. Х 15").
  const trailingMatch = segment.match(/([\d][\wЀ-ӿ-]*)$/);
  if (trailingMatch) return trailingMatch[1];

  // Try leading digit only when it is NOT followed by more alphabetic text
  // (which would indicate a digit-prefixed street name like "9 Септември 15"
  // — in that case the trailing match above already captured "15").
  const leadingMatch = segment.match(/^([\d][\wЀ-ӿ-]*)/);
  if (leadingMatch) {
    const afterMatch = segment.slice(leadingMatch[1].length).trimStart();
    // If more alphabetic text follows, this digit is part of the street name.
    if (/^[A-Za-zА-Яа-яЁёЀ-ӿ]/.test(afterMatch)) return undefined;
    return leadingMatch[1];
  }

  return undefined;
}
