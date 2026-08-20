/**
 * Accessibility utility functions
 */

/**
 * Trap focus within a modal or dialog
 */
export const trapFocus = (element: HTMLElement) => {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  const firstFocusable = focusableElements[0] as HTMLElement;
  const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

  const handleTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        e.preventDefault();
      }
    }
  };

  element.addEventListener('keydown', handleTabKey);
  firstFocusable?.focus();

  return () => {
    element.removeEventListener('keydown', handleTabKey);
  };
};

/**
 * Announce to screen readers
 */
export const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

/**
 * Generate unique ID for form elements
 */
let idCounter = 0;
export const generateId = (prefix: string = 'id'): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
};

/**
 * Check if element is visible
 */
export const isVisible = (element: HTMLElement): boolean => {
  return !!(
    element.offsetWidth ||
    element.offsetHeight ||
    element.getClientRects().length
  );
};

/**
 * Get accessible name for element
 */
export const getAccessibleName = (element: HTMLElement): string => {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelElement = document.getElementById(ariaLabelledBy);
    if (labelElement) return labelElement.textContent || '';
  }

  return element.textContent || '';
};

/**
 * Skip to main content
 */
export const skipToMain = () => {
  const main = document.querySelector('main');
  if (main) {
    main.focus();
    main.scrollIntoView({ behavior: 'smooth' });
  }
};

/**
 * BC-QA-015 — scroll-to-first-error + focus mechanism.
 *
 * Finds the first element carrying `aria-invalid="true"` in DOM order within
 * `container`, scrolls it into the viewport, and moves keyboard focus to it
 * so sighted users see the failure and assistive-tech users land right on
 * the field whose error text (wired via aria-describedby / role="alert" on
 * the caller's markup) gets announced.
 *
 * Works for native form controls (input/select/textarea/button/a) and for
 * non-native "group" containers (e.g. a chip-based multi-select or a map
 * picker) alike — the latter get a temporary `tabindex="-1"` so `.focus()`
 * has somewhere to land without joining the normal tab order.
 */
// BC-QA-015 F3 fix — marks a `tabindex="-1"` we synthesized ourselves (as
// opposed to one already present on the markup for some other reason), so we
// know it's ours to clean up once the field it's on is no longer invalid.
const SYNTHETIC_TABINDEX_ATTR = 'data-a11y-synthetic-tabindex';

export const focusFirstInvalidField = (
  container: HTMLElement | Document | null | undefined,
): boolean => {
  if (!container) return false;

  // BC-QA-015 F3 fix — before looking for THIS attempt's first invalid field,
  // sweep for synthetic tabindex="-1" attributes left behind by an earlier
  // attempt whose field has since become valid (aria-invalid flipped back to
  // false/absent) and remove them, so a fixed field doesn't carry a
  // permanent stray tabindex="-1" forever.
  container
    .querySelectorAll<HTMLElement>(`[${SYNTHETIC_TABINDEX_ATTR}="true"]`)
    .forEach(el => {
      if (el.getAttribute('aria-invalid') !== 'true') {
        el.removeAttribute('tabindex');
        el.removeAttribute(SYNTHETIC_TABINDEX_ATTR);
      }
    });

  const invalid = container.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!invalid) return false;

  invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const isNativelyFocusable = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(
    invalid.tagName,
  );
  if (!isNativelyFocusable && !invalid.hasAttribute('tabindex')) {
    invalid.setAttribute('tabindex', '-1');
    invalid.setAttribute(SYNTHETIC_TABINDEX_ATTR, 'true');
  }
  invalid.focus({ preventScroll: true });
  return true;
};
