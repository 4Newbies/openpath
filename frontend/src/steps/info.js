import { h } from '../dom.js';
import { heading, localized } from './common.js';

export function renderInfo(ctx) {
  return {
    node: h('div', { class: 'op-step' }, heading(ctx), ctx.q.hint ? localized('p', { class: 'op-body' }, ctx.q.hint, ctx.lang) : null),
    focusField: () => {},
  };
}
