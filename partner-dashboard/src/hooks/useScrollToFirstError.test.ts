import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScrollToFirstError } from './useScrollToFirstError';

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

const buildForm = () => {
  const form = document.createElement('form');
  form.innerHTML = `
    <input id="firstName" />
    <input id="email" />
  `;
  document.body.appendChild(form);
  return form;
};

describe('useScrollToFirstError', () => {
  it('markAttempt is a no-op when no field is invalid at the time the animation frame runs', () => {
    const form = buildForm();
    const ref = { current: form };
    const { result } = renderHook(() => useScrollToFirstError(ref));

    act(() => {
      result.current.markAttempt();
      vi.runAllTimers();
    });

    expect(document.activeElement).not.toBe(form.querySelector('#email'));
  });

  it('markAttempt focuses the first invalid field in DOM order once the frame runs', () => {
    const form = buildForm();
    const email = form.querySelector('#email') as HTMLInputElement;
    email.setAttribute('aria-invalid', 'true');
    const ref = { current: form };
    const { result } = renderHook(() => useScrollToFirstError(ref));

    act(() => {
      result.current.markAttempt();
      vi.runAllTimers();
    });

    expect(document.activeElement).toBe(email);
  });

  it('a superseded attempt (rapid double-submit) is skipped in favor of the newest one', () => {
    const form = buildForm();
    const firstName = form.querySelector('#firstName') as HTMLInputElement;
    const email = form.querySelector('#email') as HTMLInputElement;
    firstName.setAttribute('aria-invalid', 'true');
    email.setAttribute('aria-invalid', 'true');
    const ref = { current: form };
    const { result } = renderHook(() => useScrollToFirstError(ref));

    act(() => {
      // Fire twice synchronously before either rAF callback runs — only the
      // second (newest) attempt should actually focus anything.
      result.current.markAttempt();
      firstName.removeAttribute('aria-invalid');
      result.current.markAttempt();
      vi.runAllTimers();
    });

    expect(document.activeElement).toBe(email);
  });
});
