import { isEmpty, visibleQuestions } from '../../shared/flow.js';
import { h, sr } from './dom.js';
import { pick, t } from './messages.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Human-readable answer text for the review screen. */
export function displayAnswer(q, value, lang) {
  if (isEmpty(value)) return t(lang, 'notAnswered');
  const label = (v) => pick(q.options?.find((o) => o.value === v)?.label, lang).text || v;
  switch (q.type) {
    case 'single':
      return label(value);
    case 'multi':
      return value.map(label).join(', ');
    case 'yesno':
      return t(lang, value ? 'yes' : 'no');
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : value;
    }
    default:
      return String(value);
  }
}

/**
 * Review screen: every visible question with its answer and an Edit button.
 * Returns { node, focusHeading }.
 */
export function renderReview({ flow, answers, lang, uid, onEdit, onBack, onSubmit, submitError, busy }) {
  const headingId = `op-${uid}-review-heading`;
  const errorId = submitError ? `op-${uid}-submit-error` : undefined;
  const items = visibleQuestions(flow, answers)
    .filter((q) => q.type !== 'info')
    .map((q) => {
      const label = pick(q.label, lang);
      return h(
        'div',
        { class: 'op-review-item' },
        h('dt', { lang: label.lang !== lang ? label.lang : undefined, text: label.text }),
        h('dd', { class: isEmpty(answers[q.id]) ? 'op-review-empty' : undefined, text: displayAnswer(q, answers[q.id], lang) }),
        h(
          'dd',
          { class: 'op-review-action' },
          h('button', { type: 'button', class: 'op-button op-secondary', onclick: () => onEdit(q.id) }, t(lang, 'edit'), sr(t(lang, 'editHidden', { q: label.text }))),
        ),
      );
    });

  const heading = h('h2', { id: headingId, class: 'op-question', tabindex: '-1', text: t(lang, 'reviewTitle') });
  const node = h(
    'div',
    { class: 'op-step' },
    heading,
    h('p', { class: 'op-hint', text: t(lang, 'reviewIntro') }),
    h('dl', { class: 'op-review' }, items),
    submitError ? h('p', { id: errorId, class: 'op-error' }, sr(t(lang, 'errorPrefix')), submitError) : null,
    h(
      'div',
      { class: 'op-nav' },
      h('button', { type: 'button', class: 'op-button op-secondary', onclick: onBack, text: t(lang, 'back') }),
      h('button', {
        type: 'button',
        class: 'op-button op-primary',
        'aria-describedby': errorId,
        'aria-disabled': busy ? 'true' : undefined,
        onclick: () => !busy && onSubmit(),
        text: t(lang, busy ? 'submitting' : 'submit'),
      }),
    ),
  );
  return { node, focusHeading: () => heading.focus() };
}
