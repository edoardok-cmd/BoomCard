import { useRef, type RefObject } from 'react';
import { focusFirstInvalidField } from '../utils/a11y';

/**
 * BC-QA-015 — shared "scroll to first invalid field + focus it" mechanism
 * for hand-rolled forms.
 *
 * Usage:
 *   const formRef = useRef<HTMLFormElement>(null);
 *   const { markAttempt } = useScrollToFirstError(formRef);
 *
 *   const handleSubmit = (e) => {
 *     e.preventDefault();
 *     const newErrors = validate();
 *     setErrors(newErrors);         // drives aria-invalid on the fields below
 *     markAttempt();                // no-op if nothing is invalid once painted
 *     if (Object.keys(newErrors).length > 0) return;
 *     ...
 *   };
 *
 * Mark every invalid field's control (or its wrapping group container, for
 * non-native widgets) with `aria-invalid={touched.x && !!errors.x}` and give
 * its error text `id="x-error"` + `role="alert"`, referenced from the
 * control via `aria-describedby="x-error"`. `markAttempt` waits a frame so
 * the just-committed `aria-invalid` attributes are on the DOM before it
 * looks for the first one, then scrolls to and focuses it.
 */
export function useScrollToFirstError<T extends HTMLElement = HTMLElement>(
  containerRef: RefObject<T | null>,
) {
  const attemptRef = useRef(0);

  const markAttempt = () => {
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    requestAnimationFrame(() => {
      // A newer attempt superseded this one (e.g. rapid double-submit) — skip.
      if (attemptRef.current !== attempt) return;
      focusFirstInvalidField(containerRef.current);
    });
  };

  return { markAttempt };
}
