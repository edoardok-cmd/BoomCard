/**
 * Shared admin-panel palette.
 *
 * Every admin page / admin component previously declared its own local
 * `const palette = { ... }` with HARDCODED warm-paper hex values. Hardcoded
 * values do not flip when `data-theme="dark"` is set on <html>, so the admin
 * panel stayed light in night mode (BC-ADMIN-DARKMODE-SWEEP-017).
 *
 * This module replaces those local palettes with a single object whose values
 * are CSS custom properties defined in `src/styles/variables.css` for all
 * three themes (`:root` light, `[data-theme="dark"]`, `[data-theme="color"]`).
 * Because styled-components only interpolates these strings into the CSS, the
 * browser resolves `var(--admin-*)` at paint time and surfaces flip correctly
 * with the active theme.
 *
 * The light-mode values of the tokens equal the historical hardcoded palette,
 * so light mode is unchanged.
 *
 * Keys are a superset of every key any admin file used; files destructure only
 * the ones they need, so importing this everywhere is safe.
 */
export const palette = {
  // Surfaces & structure
  bg: 'var(--admin-bg)',
  surface: 'var(--admin-surface)',
  surfaceAlt: 'var(--admin-surface-alt)',
  border: 'var(--admin-border)',
  borderStrong: 'var(--admin-border-strong)',

  // Text
  text: 'var(--admin-text)',
  textMuted: 'var(--admin-text-muted)',
  textSubtle: 'var(--admin-text-subtle)',
  /** Text/icon color that sits on a colored fill (buttons, badges). Stays light in all themes. */
  onAccent: 'var(--admin-on-accent)',

  // Brand accent
  accent: 'var(--admin-accent)',
  accentSoft: 'var(--admin-accent-soft)',

  // Functional
  success: 'var(--admin-success)',
  successSoft: 'var(--admin-success-soft)',
  successBorder: 'var(--admin-success-border)',
  danger: 'var(--admin-danger)',
  dangerSoft: 'var(--admin-danger-soft)',
  dangerBorder: 'var(--admin-danger-border)',
  info: 'var(--admin-info)',
  infoSoft: 'var(--admin-info-soft)',
  infoBorder: 'var(--admin-info-border)',
  warning: 'var(--admin-warning)',
  warningSoft: 'var(--admin-warning-soft)',
  warningBorder: 'var(--admin-warning-border)',
  /** Readable warning text on a warning-soft surface (e.g. guidance banners); flips per theme. */
  warningText: 'var(--admin-warning-text)',

  // Extended hues used by some pages
  purple: 'var(--admin-purple)',
  purpleSoft: 'var(--admin-purple-soft)',
  purpleBorder: 'var(--admin-purple-border)',
  teal: 'var(--admin-teal)',
  tealSoft: 'var(--admin-teal-soft)',
  amber: 'var(--admin-amber)',
  amberSoft: 'var(--admin-amber-soft)',

  // Chat bubbles (TicketDrawer)
  adminBubble: 'var(--admin-admin-bubble)',
  userBubble: 'var(--admin-user-bubble)',

  // Test-data tag (AdminSubscriptionsPage)
  testTagBg: 'var(--admin-test-tag-bg)',
  testTagFg: 'var(--admin-test-tag-fg)',

  // Side-nav active highlight (CategoryShell)
  navActive: 'var(--admin-nav-active)',
  navActiveSoft: 'var(--admin-nav-active-soft)',
} as const;

/**
 * Z-index scale for layering UI elements.
 * Base layers: 0-99 (tables, cards), 100-199 (overlays, backdrops), 200+ (modals, drawers).
 * Dropdown menus must sit above all modals and drawers (e.g. z-index 1100).
 */
export const zIndex = {
  // Base layers (content, cards)
  base: 0,

  // Overlays and semi-transparent backdrops
  overlay: 100,
  modalBackdrop: 200,

  // Modals, drawers, panels
  modal: 1000,
  drawer: 1001,
  notification: 1050,

  // Dropdowns, tooltips, popovers (must be above all modals/drawers)
  dropdown: 1100,
  tooltip: 1100,
  popover: 1100,

  // Top-most layers (for critical alerts, top navigation overlays)
  max: 9999,
} as const;

export type AdminPalette = typeof palette;

export default palette;
