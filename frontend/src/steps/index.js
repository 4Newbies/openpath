import { renderDate } from './date.js';
import { renderInfo } from './info.js';
import { renderMulti } from './multi.js';
import { renderPhone } from './phone.js';
import { renderSingle } from './single.js';
import { renderText } from './text.js';
import { renderYesNo } from './yesno.js';

export const STEP_RENDERERS = {
  text: renderText,
  phone: renderPhone,
  date: renderDate,
  single: renderSingle,
  multi: renderMulti,
  yesno: renderYesNo,
  info: renderInfo,
};

export function renderStep(ctx) {
  return STEP_RENDERERS[ctx.q.type](ctx);
}
