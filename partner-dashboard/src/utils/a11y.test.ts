import { describe, it, expect, beforeEach } from 'vitest';
import { focusFirstInvalidField } from './a11y';

// jsdom doesn't implement scrollIntoView — stub it so we can call the real
// focus/tabindex logic without throwing.
beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  document.body.innerHTML = '';
});

const buildForm = () => {
  const form = document.createElement('form');
  form.innerHTML = `
    <input id="firstName" />
    <div id="categoryGroup" role="group"></div>
    <input id="email" />
  `;
  document.body.appendChild(form);
  return form;
};

describe('focusFirstInvalidField', () => {
  it('is a no-op and returns false when nothing is invalid', () => {
    const form = buildForm();
    const result = focusFirstInvalidField(form);
    expect(result).toBe(false);
    expect(document.activeElement).not.toBe(form.querySelector('#firstName'));
  });

  it('returns false and does nothing for a null/undefined container', () => {
    expect(focusFirstInvalidField(null)).toBe(false);
    expect(focusFirstInvalidField(undefined)).toBe(false);
  });

  it('focuses the first invalid field in DOM order for a native control', () => {
    const form = buildForm();
    const email = form.querySelector('#email') as HTMLInputElement;
    // Mark the LATER field invalid to make sure DOM order (not selection
    // order) governs which one wins when there's only one invalid field.
    email.setAttribute('aria-invalid', 'true');

    const result = focusFirstInvalidField(form);

    expect(result).toBe(true);
    expect(document.activeElement).toBe(email);
  });

  it('picks the first invalid field in DOM order when multiple fields are invalid', () => {
    const form = buildForm();
    const firstName = form.querySelector('#firstName') as HTMLInputElement;
    const email = form.querySelector('#email') as HTMLInputElement;
    // Both invalid — firstName precedes email in DOM order and must win.
    firstName.setAttribute('aria-invalid', 'true');
    email.setAttribute('aria-invalid', 'true');

    focusFirstInvalidField(form);

    expect(document.activeElement).toBe(firstName);
  });

  it('assigns a synthetic tabindex="-1" to a non-natively-focusable invalid group and focuses it', () => {
    const form = buildForm();
    const group = form.querySelector('#categoryGroup') as HTMLDivElement;
    group.setAttribute('aria-invalid', 'true');

    const result = focusFirstInvalidField(form);

    expect(result).toBe(true);
    expect(group.getAttribute('tabindex')).toBe('-1');
    expect(group.getAttribute('data-a11y-synthetic-tabindex')).toBe('true');
    expect(document.activeElement).toBe(group);
  });

  it('does not overwrite a pre-existing tabindex, and does not mark it as synthetic', () => {
    const form = buildForm();
    const group = form.querySelector('#categoryGroup') as HTMLDivElement;
    group.setAttribute('tabindex', '0');
    group.setAttribute('aria-invalid', 'true');

    focusFirstInvalidField(form);

    expect(group.getAttribute('tabindex')).toBe('0');
    expect(group.hasAttribute('data-a11y-synthetic-tabindex')).toBe(false);
  });

  it('F3: removes a synthetic tabindex="-1" once the field is no longer invalid on a later attempt', () => {
    const form = buildForm();
    const group = form.querySelector('#categoryGroup') as HTMLDivElement;
    group.setAttribute('aria-invalid', 'true');

    // First attempt — field is invalid, synthetic tabindex gets added.
    focusFirstInvalidField(form);
    expect(group.getAttribute('tabindex')).toBe('-1');
    expect(group.hasAttribute('data-a11y-synthetic-tabindex')).toBe(true);

    // Field becomes valid (caller flips aria-invalid back to false, as
    // RegisterPartnerPage does once the underlying error clears).
    group.setAttribute('aria-invalid', 'false');

    // Next attempt — nothing else invalid this time, but the stray
    // tabindex/marker from the prior attempt must be swept away.
    const result = focusFirstInvalidField(form);

    expect(result).toBe(false);
    expect(group.hasAttribute('tabindex')).toBe(false);
    expect(group.hasAttribute('data-a11y-synthetic-tabindex')).toBe(false);
  });

  it('F3: leaves a still-invalid field\'s synthetic tabindex alone across attempts', () => {
    const form = buildForm();
    const group = form.querySelector('#categoryGroup') as HTMLDivElement;
    group.setAttribute('aria-invalid', 'true');

    focusFirstInvalidField(form);
    expect(group.getAttribute('tabindex')).toBe('-1');

    // Still invalid on the next attempt — tabindex must survive the sweep.
    const result = focusFirstInvalidField(form);

    expect(result).toBe(true);
    expect(group.getAttribute('tabindex')).toBe('-1');
    expect(group.getAttribute('data-a11y-synthetic-tabindex')).toBe('true');
  });
});
