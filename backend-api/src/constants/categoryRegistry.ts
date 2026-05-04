/**
 * Server-side category registry for validation.
 *
 * Mirrors the slug structure of partner-dashboard/src/types/categories.types.ts.
 * Keep in sync when slugs are added/changed there.
 */

export interface CategoryNode {
  id: string;
  subcategoryIds: string[];
}

export const placesCategories: CategoryNode[] = [
  {
    id: 'restaurants',
    subcategoryIds: [
      'restaurants/curated',
      'restaurants/fast-food',
      'restaurants/traditional',
      'restaurants/vegetarian-vegan',
      'restaurants/asian',
    ],
  },
  {
    id: 'accommodation',
    subcategoryIds: [
      'accommodation/hotels',
      'accommodation/guest-houses',
      'accommodation/apartments',
    ],
  },
  {
    id: 'spa',
    subcategoryIds: [
      'spa/spa-centers',
      'spa/pools',
      'spa/mineral-pools',
      'spa/fitness-wellness',
      'spa/sports',
    ],
  },
  {
    id: 'panoramic',
    subcategoryIds: [
      'panoramic/bars',
      'panoramic/restaurants',
    ],
  },
  {
    id: 'clubs',
    subcategoryIds: [
      'clubs/clubs',
      'clubs/bars',
      'clubs/lounge',
      'clubs/parties-events',
      'clubs/live-music',
    ],
  },
  {
    id: 'cafes',
    subcategoryIds: [
      'cafes/cafes',
      'cafes/pastry-shops',
      'cafes/brunch',
      'cafes/bakeries',
    ],
  },
];

export const experiencesCategories: CategoryNode[] = [
  {
    id: 'gastronomic',
    subcategoryIds: [
      'gastronomic/degustations',
      'gastronomic/food-traditions',
    ],
  },
  {
    id: 'historical-cultural',
    subcategoryIds: [
      'historical-cultural/walking-tours',
      'historical-cultural/historical-tours',
      'historical-cultural/museums-galleries',
    ],
  },
  {
    id: 'active-adventure',
    subcategoryIds: [
      'active-adventure/nature-tours',
      'active-adventure/bike-tours',
      'active-adventure/offroad-atv',
      'active-adventure/water-activities',
    ],
  },
  {
    id: 'extreme',
    subcategoryIds: [
      'extreme/aerial',
      'extreme/jumping',
      'extreme/motorcycles',
      'extreme/water',
    ],
  },
  {
    id: 'educational-creative',
    subcategoryIds: [
      'educational-creative/cooking',
      'educational-creative/workshops',
      'educational-creative/arts',
    ],
  },
  {
    id: 'relax-wellness',
    subcategoryIds: [
      'relax-wellness/spa-thermal',
      'relax-wellness/massages-therapies',
      'relax-wellness/relax-experiences',
      'relax-wellness/yoga-meditation',
    ],
  },
];

const allCategories: CategoryNode[] = [...placesCategories, ...experiencesCategories];

export const mainCategoryIds: Set<string> = new Set(allCategories.map(c => c.id));

export const subcategoryIds: Set<string> = new Set(
  allCategories.flatMap(c => c.subcategoryIds),
);

/**
 * True if id is a known main category id (no slash).
 */
export function isMainCategoryId(id: string): boolean {
  return mainCategoryIds.has(id);
}

/**
 * True if id is a known subcategory id (slash-format), regardless of parent.
 */
export function isSubcategoryId(id: string): boolean {
  return subcategoryIds.has(id);
}

/**
 * Validate that every entry in `categories` is either:
 *  - the provided main category id, or
 *  - a known subcategory whose prefix matches the main category id.
 *
 * Returns the offending value, or null if all entries are valid.
 */
export function findInvalidCategoryEntry(
  mainCategoryId: string,
  categories: string[],
): string | null {
  if (!isMainCategoryId(mainCategoryId)) return mainCategoryId;
  for (const entry of categories) {
    if (entry === mainCategoryId) continue;
    if (!isSubcategoryId(entry)) return entry;
    const [parent] = entry.split('/');
    if (parent !== mainCategoryId) return entry;
  }
  return null;
}
