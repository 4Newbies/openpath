import { renderText } from './text.js';

export function renderPhone(ctx) {
  // Phone numbers are written left to right, also in a right-to-left form.
  return renderText(ctx, { type: 'tel', autocomplete: 'tel', inputmode: 'tel', dir: 'ltr' });
}
