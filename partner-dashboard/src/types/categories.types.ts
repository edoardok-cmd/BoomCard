// ============================================================
// Shared Category Registry
// Single source of truth for category hierarchies
// Used by BoomPlacesFilters, ExperiencesFilters, and all listing pages
// ============================================================

import { BilingualText } from './entity.types';

export interface CategoryDefinition {
  id: string;
  name: BilingualText;
  subcategories: SubcategoryDefinition[];
}

export interface SubcategoryDefinition {
  id: string;
  name: BilingualText;
  children?: SubcategoryDefinition[];
}

// --- BOOM Places categories ---
export const placesCategories: CategoryDefinition[] = [
  {
    id: 'restaurants',
    name: { en: 'Restaurants & Food', bg: 'Ресторанти и храна' },
    subcategories: [
      { id: 'restaurants/curated', name: { en: 'BOOM Restaurants', bg: 'BOOM Ресторанти' } },
      { id: 'restaurants/fast-food', name: { en: 'Fast Food', bg: 'Бързо хранене' } },
      { id: 'restaurants/traditional', name: { en: 'Traditional Cuisine', bg: 'Традиционна кухня' } },
      { id: 'restaurants/mehana', name: { en: 'Mehana (Tavern)', bg: 'Механа' } },
      { id: 'restaurants/vegetarian-vegan', name: { en: 'Vegetarian & Vegan', bg: 'Вегетарианска и веган' } },
      {
        id: 'restaurants/foreign',
        name: { en: 'Foreign Cuisine', bg: 'Чуждестранна кухня' },
        children: [
          { id: 'restaurants/foreign/fine-dining', name: { en: 'Fine Dining', bg: 'Фино хранене' } },
          { id: 'restaurants/foreign/seafood', name: { en: 'Seafood', bg: 'Морска храна' } },
          { id: 'restaurants/foreign/pizza-italian', name: { en: 'Pizza & Italian', bg: 'Пица и италианска кухня' } },
          { id: 'restaurants/foreign/asian', name: { en: 'Asian Cuisine', bg: 'Азиатска кухня' } },
          { id: 'restaurants/foreign/bbq-grill', name: { en: 'BBQ & Grill', bg: 'Барбекю и скара' } },
          { id: 'restaurants/foreign/steakhouse', name: { en: 'Steakhouse', bg: 'Стейкхаус' } },
          { id: 'restaurants/foreign/sushi', name: { en: 'Sushi', bg: 'Суши' } },
        ],
      },
    ],
  },
  {
    id: 'accommodation',
    name: { en: 'Accommodation', bg: 'Настаняване' },
    subcategories: [
      { id: 'accommodation/hotels', name: { en: 'Hotels', bg: 'Хотели' } },
      { id: 'accommodation/guest-houses', name: { en: 'Guest Houses', bg: 'Къщи за гости' } },
      { id: 'accommodation/apartments', name: { en: 'Apartments', bg: 'Апартаменти' } },
    ],
  },
  {
    id: 'spa',
    name: { en: 'SPA & Wellness', bg: 'СПА и уелнес' },
    subcategories: [
      { id: 'spa/spa-centers', name: { en: 'SPA Centers', bg: 'СПА центрове' } },
      { id: 'spa/pools', name: { en: 'Pools', bg: 'Басейни' } },
      { id: 'spa/mineral-pools', name: { en: 'Mineral Pools', bg: 'Минерални басейни' } },
      { id: 'spa/fitness-wellness', name: { en: 'Fitness & Wellness', bg: 'Фитнес и уелнес' } },
      { id: 'spa/sports', name: { en: 'Sports', bg: 'Спорт' } },
    ],
  },
  {
    id: 'panoramic',
    name: { en: 'Panoramic Places', bg: 'Панорамни места' },
    subcategories: [
      { id: 'panoramic/bars', name: { en: 'Rooftop Bars', bg: 'Руфтоп барове' } },
      { id: 'panoramic/restaurants', name: { en: 'Sky Restaurants', bg: 'Скай ресторанти' } },
    ],
  },
  {
    id: 'clubs',
    name: { en: 'Clubs & Nightlife', bg: 'Клубове и нощен живот' },
    subcategories: [
      { id: 'clubs/clubs', name: { en: 'Clubs', bg: 'Клубове' } },
      { id: 'clubs/bars', name: { en: 'Bars', bg: 'Барове' } },
      { id: 'clubs/lounge', name: { en: 'Lounge', bg: 'Лаундж' } },
      { id: 'clubs/parties-events', name: { en: 'Parties & Events', bg: 'Партита и събития' } },
      { id: 'clubs/live-music', name: { en: 'Live Music', bg: 'Жива музика' } },
    ],
  },
  {
    id: 'cafes',
    name: { en: 'Cafes, Pastry Shops & Bakeries', bg: 'Кафенета, сладкарници и пекарни' },
    subcategories: [
      { id: 'cafes/cafes', name: { en: 'Cafes', bg: 'Кафенета' } },
      { id: 'cafes/pastry-shops', name: { en: 'Pastry Shops', bg: 'Сладкарници' } },
      { id: 'cafes/brunch', name: { en: 'Brunch', bg: 'Бранч' } },
      { id: 'cafes/bakeries', name: { en: 'Bakeries', bg: 'Пекарни' } },
    ],
  },
];

// --- Experiences categories ---
export const experiencesCategories: CategoryDefinition[] = [
  {
    id: 'gastronomic',
    name: { en: 'Gastronomic', bg: 'Гастрономични' },
    subcategories: [
      { id: 'gastronomic/degustations', name: { en: 'Degustations', bg: 'Дегустации' } },
      { id: 'gastronomic/food-traditions', name: { en: 'Food & Traditions', bg: 'Храна и традиции' } },
    ],
  },
  {
    id: 'historical-cultural',
    name: { en: 'Historical & Cultural', bg: 'Исторически и културни' },
    subcategories: [
      { id: 'historical-cultural/walking-tours', name: { en: 'Walking Tours', bg: 'Пешеходни турове' } },
      { id: 'historical-cultural/historical-tours', name: { en: 'Historical Tours', bg: 'Исторически турове' } },
      { id: 'historical-cultural/museums-galleries', name: { en: 'Museums & Galleries', bg: 'Музеи и галерии' } },
    ],
  },
  {
    id: 'active-adventure',
    name: { en: 'Active & Adventure', bg: 'Активни и приключенски' },
    subcategories: [
      { id: 'active-adventure/nature-tours', name: { en: 'Nature Tours', bg: 'Природни турове' } },
      { id: 'active-adventure/bike-tours', name: { en: 'Bike Tours', bg: 'Вело турове' } },
      { id: 'active-adventure/offroad-atv', name: { en: 'Offroad & ATV', bg: 'Офроуд и ATV' } },
      { id: 'active-adventure/water-activities', name: { en: 'Water Activities', bg: 'Водни дейности' } },
    ],
  },
  {
    id: 'extreme',
    name: { en: 'Extreme', bg: 'Екстремни' },
    subcategories: [
      { id: 'extreme/aerial', name: { en: 'Aerial', bg: 'Въздушни' } },
      { id: 'extreme/jumping', name: { en: 'Jumping', bg: 'Скачане' } },
      { id: 'extreme/motorcycles', name: { en: 'Motorcycles', bg: 'Мотоциклети' } },
      { id: 'extreme/water', name: { en: 'Water', bg: 'Водни' } },
    ],
  },
  {
    id: 'educational-creative',
    name: { en: 'Educational & Creative', bg: 'Образователни и творчески' },
    subcategories: [
      { id: 'educational-creative/cooking', name: { en: 'Cooking', bg: 'Готвене' } },
      { id: 'educational-creative/workshops', name: { en: 'Workshops', bg: 'Уъркшопи' } },
      { id: 'educational-creative/arts', name: { en: 'Arts', bg: 'Изкуство' } },
    ],
  },
  {
    id: 'relax-wellness',
    name: { en: 'Relax & Wellness', bg: 'Релакс и уелнес' },
    subcategories: [
      { id: 'relax-wellness/spa-thermal', name: { en: 'SPA & Thermal', bg: 'СПА и термални' } },
      { id: 'relax-wellness/massages-therapies', name: { en: 'Massages & Therapies', bg: 'Масажи и терапии' } },
      { id: 'relax-wellness/relax-experiences', name: { en: 'Relax Experiences', bg: 'Релакс изживявания' } },
      { id: 'relax-wellness/yoga-meditation', name: { en: 'Yoga & Meditation', bg: 'Йога и медитация' } },
    ],
  },
];

// --- Utility functions ---

/** Get all categories (places + experiences) */
export function getAllCategories(): CategoryDefinition[] {
  return [...placesCategories, ...experiencesCategories];
}

/** Find a category by ID across both registries */
export function findCategory(id: string): CategoryDefinition | undefined {
  return getAllCategories().find(c => c.id === id);
}

/** Find a subcategory by ID across all categories (including nested children) */
export function findSubcategory(id: string): { parent: CategoryDefinition; sub: SubcategoryDefinition } | undefined {
  for (const cat of getAllCategories()) {
    for (const sub of cat.subcategories) {
      if (sub.id === id) return { parent: cat, sub };
      if (sub.children) {
        const child = sub.children.find(c => c.id === id);
        if (child) return { parent: cat, sub: child };
      }
    }
  }
  return undefined;
}

/** Get category display name based on language */
export function getCategoryName(id: string, lang: 'en' | 'bg'): string {
  const cat = findCategory(id);
  if (cat) return cat.name[lang];
  const sub = findSubcategory(id);
  if (sub) return sub.sub.name[lang];
  return id;
}

/** Build initial filter category selection from a URL `type` query parameter.
 *  Returns an array of category IDs to pre-select (parent + subcategory + child). */
export function getInitialCategoriesFromType(categoryId: string, type: string | null): string[] {
  if (!type) return [];

  const category = findCategory(categoryId);
  if (!category) return [];

  for (const sub of category.subcategories) {
    // Direct subcategory match (e.g. "traditional" → "restaurants/traditional")
    if (sub.id === `${categoryId}/${type}`) {
      return [categoryId, sub.id];
    }
    // Check nested children (e.g. "fine-dining" → "restaurants/foreign/fine-dining")
    if (sub.children) {
      for (const child of sub.children) {
        if (child.id === `${sub.id}/${type}`) {
          return [categoryId, sub.id, child.id];
        }
      }
    }
  }

  return [];
}
