import type { Entity } from '../types/entity.types';
import type { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';
import { placesCategories } from '../types/categories.types';

/**
 * Client-side filtering of entities based on BoomPlacesFiltersState.
 * Returns entities matching ALL active filter groups (AND logic between groups,
 * OR logic within each group).
 */
export function filterEntities(
  entities: Entity[],
  filters: BoomPlacesFiltersState
): Entity[] {
  const hasCategories = filters.categories.length > 0;
  const hasLocations = filters.locations.length > 0;
  const hasDiscount = filters.discountRanges.length > 0;
  const hasRating = filters.ratingRanges.length > 0;
  const hasPriceLevels = filters.priceLevels.length > 0;

  // No filters active → return all
  if (!hasCategories && !hasLocations && !hasDiscount && !hasRating && !hasPriceLevels) {
    return entities;
  }

  // Build a set of all selected subcategory/child IDs for category matching.
  // If only a parent category is selected (no subcategories), match all entities
  // under that parent. If specific subcategories are selected, match only those.
  const selectedSubIds = new Set<string>();
  const selectedParentOnlyIds = new Set<string>();

  if (hasCategories) {
    for (const catId of filters.categories) {
      const parentCat = placesCategories.find(c => c.id === catId);
      if (parentCat) {
        // Check if any subcategory of this parent is also selected
        const hasSubSelected = parentCat.subcategories.some(
          s => filters.categories.includes(s.id)
        );
        if (!hasSubSelected) {
          // Parent selected with no subs → match all under this parent
          selectedParentOnlyIds.add(catId);
        }
      } else {
        // It's a subcategory or child ID
        selectedSubIds.add(catId);
      }
    }
  }

  return entities.filter(entity => {
    // --- Category filter ---
    if (hasCategories) {
      const entityCatId = entity.categoryId || '';
      const entitySubIds = entity.subcategoryIds || [];

      let categoryMatch = false;

      // Check if entity matches any parent-only selection
      for (const parentId of selectedParentOnlyIds) {
        if (
          entityCatId === parentId ||
          entityCatId.startsWith(parentId + '/') ||
          entitySubIds.some(id => id === parentId || id.startsWith(parentId + '/'))
        ) {
          categoryMatch = true;
          break;
        }
      }

      // Check if entity matches any specific subcategory/child selection
      if (!categoryMatch && selectedSubIds.size > 0) {
        for (const subId of selectedSubIds) {
          if (
            entityCatId === subId ||
            entityCatId.startsWith(subId + '/') ||
            entitySubIds.some(id => id === subId || id.startsWith(subId + '/'))
          ) {
            categoryMatch = true;
            break;
          }
        }
      }

      if (!categoryMatch) return false;
    }

    // --- Location filter ---
    if (hasLocations) {
      const entityCity = (entity.location.city || entity.location.display || '').toLowerCase();
      const locationMatch = filters.locations.some(
        locId => entityCity.includes(locId.toLowerCase())
      );
      if (!locationMatch) return false;
    }

    // --- Discount filter ---
    if (hasDiscount) {
      const discount = entity.discount?.percent ?? 0;
      const discountMatch = filters.discountRanges.some(rangeId => {
        const [min, max] = rangeId.split('-').map(Number);
        return discount >= min && discount <= max;
      });
      if (!discountMatch) return false;
    }

    // --- Rating filter ---
    if (hasRating) {
      const rating = entity.rating ?? 0;
      const ratingMatch = filters.ratingRanges.some(rangeId => {
        const [min, max] = rangeId.split('-').map(Number);
        return rating >= min && rating <= max;
      });
      if (!ratingMatch) return false;
    }

    // --- Price level filter ---
    if (hasPriceLevels) {
      const priceRange = entity.priceRange || '';
      if (!filters.priceLevels.includes(priceRange)) return false;
    }

    return true;
  });
}
