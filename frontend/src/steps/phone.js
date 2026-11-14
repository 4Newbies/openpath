import { renderText } from './text.js';

export function renderPhone(ctx) {
  return renderText(ctx, { type: 'tel', autocomplete: 'tel', inputmode: 'tel' });
}
