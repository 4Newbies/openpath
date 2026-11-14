import { h, setText } from './dom.js';

// "How do you want to use this?" The first control is the button that keeps
// everything off, so screen reader, voice typing and switch users can go
// straight on with their own tools.

// When the host offers several languages, a language switcher comes right
// after the heading: each language is written in itself, with its own lang.
// "My details on this device" says whether a name and phone are kept here
// and, when they are, offers "Forget my details" (for shared computers).
export function renderSetup({ tr, uid, prefs, available, onDeviceTools, onContinue, onPreview, languages = [], current, onLanguage, detailsKept = false, onForgetDetails }) {
  const headingId = `op-${uid}-setup-heading`;
  const introId = `op-${uid}-setup-intro`;
  const options = [
    ['readAloud', 'helperReadAloud', available.readAloud],
    ['voice', 'helperVoice', available.voice],
    ['simple', 'helperSimple', true],
    ['largerText', 'helperLarger', true],
    ['highContrast', 'helperContrast', true],
  ].filter(([, , ok]) => ok);

  const boxes = {};
  const rows = options.map(([key, label]) => {
    const id = `op-${uid}-setup-${key}`;
    const input = h('input', {
      type: 'checkbox',
      id,
      value: key,
      checked: prefs[key],
      onchange: () => onPreview(key, input.checked),
    });
    boxes[key] = input;
    return h('div', { class: 'op-option' }, input, h('label', { for: id, text: tr(label) }));
  });

  const chosen = () => Object.fromEntries(Object.entries(boxes).map(([k, el]) => [k, el.checked]));
  const heading = h('h2', { id: headingId, class: 'op-question', tabindex: '-1', text: tr('setupTitle') });
  const languageSwitcher =
    languages.length > 1
      ? h(
          'fieldset',
          { class: 'op-group op-lang' },
          h('legend', { class: 'op-legend op-subheading', text: tr('language') }),
          h(
            'div',
            { class: 'op-lang-list' },
            languages.map((l) =>
              h('button', {
                type: 'button',
                class: 'op-button op-secondary op-small',
                lang: l.code,
                dir: l.dir,
                'data-lang': l.code,
                'aria-pressed': l.code === current ? 'true' : 'false',
                onclick: () => l.code !== current && onLanguage(l.code),
                text: l.name,
              }),
            ),
          ),
        )
      : null;
  const detailsNote = h('p', { class: 'op-hint op-details-note', text: tr(detailsKept ? 'profileKept' : 'profileNotKept') });
  const forget =
    detailsKept && onForgetDetails
      ? h('button', {
          type: 'button',
          class: 'op-button op-secondary',
          text: tr('forgetMyDetails'),
          onclick: () => {
            onForgetDetails();
            setText(detailsNote, tr('profileForgotten'));
            detailsNote.setAttribute('tabindex', '-1');
            forget.remove();
            detailsNote.focus();
          },
        })
      : null;
  const details = h(
    'section',
    { class: 'op-group op-details', 'aria-labelledby': `op-${uid}-details-heading` },
    h('h3', { id: `op-${uid}-details-heading`, class: 'op-legend op-subheading', text: tr('myDetails') }),
    detailsNote,
    forget,
  );
  const node = h(
    'div',
    { class: 'op-step op-setup' },
    heading,
    languageSwitcher,
    h('p', { id: introId, class: 'op-hint', text: tr('setupIntro') }),
    h('button', { type: 'button', class: 'op-button op-primary op-wide', onclick: onDeviceTools, text: tr('useDeviceTools') }),
    h(
      'fieldset',
      { class: 'op-group op-helpers' },
      h('legend', { class: 'op-legend op-subheading', text: tr('helpersLegend') }),
      h('div', { class: 'op-options' }, rows),
    ),
    h(
      'div',
      { class: 'op-nav' },
      h('button', { type: 'button', class: 'op-button op-secondary op-push', onclick: () => onContinue(chosen()), text: tr('continueWithHelpers') }),
    ),
    details,
  );
  return { node, focusHeading: () => heading.focus() };
}
