import { isEmpty, visibleQuestions } from '../../shared/flow.js';
import { h, sr } from './dom.js';
import { labelOf, langAttrs, t, tList } from './messages.js';

/** Human-readable answer text for the review screen. */
export function displayAnswer(q, value, lang, simple = false) {
  if (isEmpty(value)) return t(lang, 'notAnswered', {}, simple);
  const label = (v) => {
    const o = q.options?.find((x) => x.value === v);
    return o ? labelOf(o, lang, simple).text : v;
  };
  switch (q.type) {
    case 'single':
      return label(value);
    case 'multi':
      return value.map(label).join(', ');
    case 'yesno':
      return t(lang, value ? 'yes' : 'no', {}, simple);
    case 'date': {
      if (q.calendar === 'ethiopian') {
        // Shown in the calendar the learner used, in their language.
        const e = value?.ethiopian;
        const month = e && tList(lang, 'ethiopianMonths')[e.month - 1];
        return month && e.day && e.year ? t(lang, 'ethiopianDateFormat', { day: e.day, month, year: e.year }) : t(lang, 'notAnswered', {}, simple);
      }
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      const month = m && tList(lang, 'gregorianMonths')[Number(m[2]) - 1];
      return month ? t(lang, 'dateFormat', { day: Number(m[3]), month, year: m[1] }) : value;
    }
    default:
      return String(value);
  }
}

/**
 * Review screen: every visible question with its answer and an Edit button.
 * Returns { node, focusHeading }.
 */
export function renderReview({ flow, answers, lang, simple = false, uid, onEdit, onBack, onSubmit, submitError, busy }) {
  const tr = (key, vars) => t(lang, key, vars, simple);
  const headingId = `op-${uid}-review-heading`;
  const errorId = submitError ? `op-${uid}-submit-error` : undefined;
  const items = visibleQuestions(flow, answers)
    .filter((q) => q.type !== 'info')
    .map((q) => {
      const label = labelOf(q, lang, simple);
      return h(
        'div',
        { class: 'op-review-item' },
        h('dt', { ...langAttrs(label.lang, lang), text: label.text }),
        h('dd', { class: isEmpty(answers[q.id]) ? 'op-review-empty' : undefined, text: displayAnswer(q, answers[q.id], lang, simple) }),
        h(
          'dd',
          { class: 'op-review-action' },
          h('button', { type: 'button', class: 'op-button op-secondary', onclick: () => onEdit(q.id) }, tr('edit'), sr(tr('editHidden', { q: label.text }))),
        ),
      );
    });

  const heading = h('h2', { id: headingId, class: 'op-question', tabindex: '-1', text: tr('reviewTitle') });
  const node = h(
    'div',
    { class: 'op-step' },
    heading,
    h('p', { class: 'op-hint', text: tr('reviewIntro') }),
    h('dl', { class: 'op-review' }, items),
    submitError ? h('p', { id: errorId, class: 'op-error' }, sr(tr('errorPrefix')), submitError) : null,
    h(
      'div',
      { class: 'op-nav' },
      h('button', { type: 'button', class: 'op-button op-secondary', onclick: onBack, text: tr('back') }),
      h('button', {
        type: 'button',
        class: 'op-button op-primary',
        'aria-describedby': errorId,
        'aria-disabled': busy ? 'true' : undefined,
        onclick: () => !busy && onSubmit(),
        text: tr(busy ? 'submitting' : 'submit'),
      }),
    ),
  );
  return { node, focusHeading: () => heading.focus() };
}
