import { cleanAnswer, validateAnswer, validateAnswers } from '../../shared/flow.js';
import { ApiError, createApi } from './api.js';
import { h, setText } from './dom.js';
import { loadFlow } from './loader.js';
import { errorMessage, FALLBACK_LANG, hasPack, LANG_CODE_RE, labelOf, langAttrs, loadPack, packInfo, pick, t, tList } from './messages.js';
import { createNavigator, REVIEW } from './navigator.js';
import { ACCESS_TO_HELPER, HELPERS, helpersToAccess, loadPrefs, savePrefs } from './prefs.js';
import { getSpeech, getVoice, loadVoiceModule, voiceAvailable } from './providers.js';
import { renderReview } from './review.js';
import { renderSetup } from './setup.js';
import { switchCalendar } from './steps/date.js';
import { renderStep } from './steps/index.js';
import { createStore } from './store.js';
import css from './styles.css?inline';

let counter = 0;
const DONE = 'done';
const SETUP = 'setup';

// Language packs live next to the script by default:
// <script src=".../openpath.js"> loads packs from ".../lang/<code>.json".
// (Read while the classic script runs; null when imported as a module.)
const SCRIPT_LANG_BASE = (() => {
  try {
    const src = document.currentScript?.src;
    return src ? new URL('lang/', src).href : null;
  } catch {
    return null;
  }
})();

/**
 * <openpath-flow questions="/questions/onboarding.json" api="http://localhost:4000" lang="en"
 *                languages="am,en,ar" lang-path="/openpath/lang/">
 *
 * lang:      starting language (default en). Packs other than English are fetched
 *            from lang-path (default: the "lang" folder next to openpath.js).
 * languages: optional; shows a language switcher on the first screen and in Settings.
 *
 * Events (bubble and cross the shadow boundary):
 *   openpath:step      detail { flowId, stepId, index, total }
 *   openpath:complete  detail { flowId, sessionId, answers }  (private answers left out)
 */
export class OpenPathFlow extends HTMLElement {
  static get observedAttributes() {
    return ['lang', 'languages', 'lang-path'];
  }

  constructor() {
    super();
    this.uid = ++counter;
    this.error = null; // { questionId, message } for the current step
    this.submitError = null;
    this.busy = false;
    this.saveChain = Promise.resolve();
  }

  /** The interface language actually in use (English until its pack has loaded). */
  get uiLang() {
    return this.activeLang ?? FALLBACK_LANG;
  }

  langBase() {
    const attr = this.getAttribute('lang-path');
    try {
      if (attr) return new URL(attr.endsWith('/') ? attr : `${attr}/`, document.baseURI).href;
      return SCRIPT_LANG_BASE ?? new URL('lang/', document.baseURI).href;
    } catch {
      return 'lang/';
    }
  }

  /** Codes from the languages="am,en,ar" attribute, in the host's order. */
  languageList() {
    const list = (this.getAttribute('languages') ?? '').split(/[\s,]+/).filter((c) => LANG_CODE_RE.test(c));
    return [...new Set(list)];
  }

  requestedLang() {
    const list = this.languageList();
    const saved = this.prefs?.lang;
    if (saved && list.includes(saved)) return saved; // the learner's own choice
    const attr = (this.getAttribute('lang') ?? '').trim();
    if (LANG_CODE_RE.test(attr)) return attr;
    return list[0] ?? FALLBACK_LANG;
  }

  /**
   * Load the packs needed (the wanted language and every switcher language,
   * so each option can show its own name) and switch to the wanted one.
   * A pack that fails to load means English. Returns false if a newer
   * call took over.
   */
  async resolveLanguage() {
    const token = {};
    this.langToken = token;
    const base = this.langBase();
    const list = this.languageList();
    const wanted = this.requestedLang();
    const codes = [...new Set([wanted, ...list])].filter((c) => c !== FALLBACK_LANG);
    await Promise.all(codes.map((c) => loadPack(c, base)));
    if (this.langToken !== token) return false;
    this.activeLang = hasPack(wanted) ? wanted : FALLBACK_LANG;
    this.switcherLangs = list.filter(hasPack).map(packInfo);
    this.applyLanguage();
    return true;
  }

  applyLanguage() {
    this.root.setAttribute('lang', this.uiLang);
    this.root.setAttribute('dir', packInfo(this.uiLang).dir);
  }

  async switchLanguage(code) {
    this.setPrefs({ lang: code });
    if (!(await this.resolveLanguage())) return;
    this.stopHelpers();
    this.render();
    // Focus stays on the language just chosen (now pressed).
    this.view.querySelector(`.op-lang [data-lang="${code}"]`)?.focus();
  }

  connectedCallback() {
    if (this.shadowRoot) return;
    const shadow = this.attachShadow({ mode: 'open' });
    this.live = h('div', { class: 'op-sr', 'aria-live': 'polite' });
    this.view = h('div', { class: 'op-card' }, h('p', { text: this.tr('loading') }));
    this.root = h('div', { class: 'op-root', lang: FALLBACK_LANG, dir: 'ltr' }, this.view, this.live);
    shadow.append(h('style', { text: css }), this.root);
    // Escape stops read-aloud and voice input. Nothing else is taken over.
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (this.speaking || this.listening)) this.stopHelpers({ announce: true });
    });
    this.ready = this.start();
  }

  disconnectedCallback() {
    this.stopHelpers();
  }

  attributeChangedCallback(name, oldValue, value) {
    if (!this.flow || oldValue === value) return;
    // A host that sets lang later means it: it replaces a saved choice.
    if (name === 'lang' && this.prefs?.lang) this.setPrefs({ lang: null });
    this.resolveLanguage().then((ok) => ok && this.render());
  }

  async start() {
    this.prefs = loadPrefs();
    const [{ flow }] = await Promise.all([loadFlow(this.getAttribute('questions')), this.resolveLanguage()]);
    this.flow = flow;
    this.store = createStore(flow);
    this.nav = createNavigator(flow);
    const api = this.getAttribute('api');
    this.api = api ? createApi(api) : null;
    this.applyPreferences();

    if (this.api && this.store.state.sessionId) await this.checkSession();
    const step = this.nav.resolve(this.store.state.step, this.store.state.answers);
    if (step !== this.store.state.step) this.store.setStep(step);
    // Browser voices load late; wait briefly only when read-aloud may be offered.
    if (!this.prefs.chosen || this.prefs.readAloud) await getSpeech().whenReady?.(1000);
    // First visit: ask how the learner wants to use the form.
    if (!this.prefs.chosen) this.openSetup({ focus: false });
    else this.go(step, { focus: false });
  }

  // A saved session that was submitted elsewhere, or no longer exists, starts over.
  async checkSession() {
    try {
      const s = await this.api.getSession(this.store.state.sessionId);
      if (s.status !== 'open') this.store.clear();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) this.store.setSession(null, null);
    }
  }

  applyPreferences(prefs = this.prefs) {
    this.root.toggleAttribute('data-larger-text', Boolean(prefs?.largerText));
    this.root.toggleAttribute('data-high-contrast', Boolean(prefs?.highContrast));
    this.root.toggleAttribute('data-simple', Boolean(prefs?.simple));
  }

  setPrefs(changes) {
    this.prefs = { ...this.prefs, ...changes };
    savePrefs(this.prefs);
    this.applyPreferences();
  }

  /** Which optional helpers this browser (or a host provider) can offer. */
  helperAvailability() {
    const lang = this.uiLang;
    return {
      readAloud: getSpeech().isAvailable(lang) || this.flow.questions.some((q) => q.audio?.[lang]),
      voice: voiceAvailable(),
    };
  }

  // ---- voice input -----------------------------------------------------------

  micAllowed(q) {
    return (
      Boolean(this.prefs?.voice) &&
      q.voice === true &&
      ['text', 'phone', 'single', 'multi', 'yesno'].includes(q.type) &&
      this.prefs.voiceConsent !== 'deny' &&
      voiceAvailable()
    );
  }

  /** The mic button and a status line under it. Its text label says what it
   *  will do ("Speak your answer" / "Stop listening"); no aria-pressed, so the
   *  state isn't announced twice. */
  micBlock(q) {
    const status = this.voiceStatus?.questionId === q.id ? this.voiceStatus.text : '';
    return h(
      'div',
      { class: 'op-voice' },
      h('button', {
        type: 'button',
        class: 'op-button op-secondary op-mic',
        onclick: () => this.micClicked(q),
        text: this.tr('speakAnswer'),
      }),
      h('p', { class: 'op-voice-status', text: status }),
    );
  }

  micClicked(q) {
    if (this.listening) {
      this.listenProvider?.stop(); // listen() then settles with what was heard
      return;
    }
    if (this.prefs.voiceConsent === 'allow') this.startListening(q);
    else this.showConsent(q);
  }

  showConsent(q) {
    const block = this.view.querySelector('.op-voice');
    const textId = `op-${this.uid}-consent`;
    const text = h('p', { id: textId, class: 'op-consent-text', tabindex: '-1', text: this.tr('consentText') });
    block.textContent = '';
    block.append(
      h(
        'div',
        { class: 'op-consent', role: 'group', 'aria-labelledby': textId },
        text,
        h(
          'div',
          { class: 'op-nav op-consent-actions' },
          h('button', {
            type: 'button',
            class: 'op-button op-primary',
            text: this.tr('consentAllow'),
            onclick: () => {
              this.setPrefs({ voiceConsent: 'allow' });
              this.render();
              this.view.querySelector('.op-mic')?.focus();
              this.startListening(q);
            },
          }),
          h('button', {
            type: 'button',
            class: 'op-button op-secondary',
            text: this.tr('consentDeny'),
            onclick: () => {
              this.setPrefs({ voiceConsent: 'deny' });
              this.render({ focusField: true });
              this.announce(this.tr('voiceDenied'));
            },
          }),
        ),
      ),
    );
    text.focus();
  }

  setMic(on) {
    const b = this.view.querySelector('.op-mic');
    if (!b) return;
    b.classList.toggle('op-mic-on', on);
    setText(b, this.tr(on ? 'stopListening' : 'speakAnswer'));
  }

  setVoiceStatus(q, text) {
    this.voiceStatus = { questionId: q.id, text };
    const p = this.view.querySelector('.op-voice-status');
    if (p) setText(p, text);
    this.announce(text);
  }

  async startListening(q) {
    this.stopSpeech(); // don't let read-aloud talk into the microphone
    const token = {};
    this.listenToken = token;
    let mod;
    try {
      mod = await loadVoiceModule();
      this.listenProvider = await getVoice();
    } catch {
      return this.setVoiceStatus(q, this.tr('voice_failed'));
    }
    if (this.listenToken !== token) return;
    this.listening = true;
    this.setMic(true);
    this.announce(this.tr('listening'));
    let text;
    try {
      text = String((await this.listenProvider.listen(this.uiLang)) ?? '').trim();
      if (!text) throw Object.assign(new Error('no_speech'), { code: 'no_speech' });
    } catch (e) {
      if (this.listenToken !== token) return; // stopped by a step change or Escape
      this.listening = false;
      this.setMic(false);
      if (e?.code === 'aborted') return this.setVoiceStatus(q, this.tr('stopped'));
      const known = ['permission', 'no_speech', 'offline', 'no_microphone'];
      return this.setVoiceStatus(q, this.tr(`voice_${known.includes(e?.code) ? e.code : 'failed'}`));
    }
    if (this.listenToken !== token) return;
    this.listening = false;
    this.setMic(false);
    this.useSpokenAnswer(q, text, mod);
  }

  stopListening() {
    if (!this.listening) return;
    this.listenToken = null;
    this.listening = false;
    this.listenProvider?.stop();
    this.setMic(false);
  }

  // Put what was said into the answer, tell the learner, and give focus to
  // the field. Never moves on by itself.
  useSpokenAnswer(q, text, mod) {
    if (q.type === 'text' || q.type === 'phone') {
      const field = this.view.querySelector('.op-input');
      field.value = text;
      this.store.setAnswer(q.id, text);
      field.focus();
      return this.setVoiceStatus(q, this.tr('youSaid', { text }));
    }
    const words = (k) => [...tList(this.uiLang, k), ...tList(FALLBACK_LANG, k)];
    const value = mod.matchSpoken(q, text, { yes: words('voiceYes'), no: words('voiceNo') });
    if (value === undefined) {
      this.setVoiceStatus(q, this.tr('noMatch', { text }));
      this.view.querySelector('.op-options input')?.focus();
      return;
    }
    this.store.setAnswer(q.id, value);
    if (q.setsPreference === 'access') this.accessAnswerChanged(q, value);
    const shown =
      q.type === 'yesno'
        ? this.tr(value ? 'yes' : 'no')
        : [].concat(value).map((v) => labelOf(q.options.find((o) => o.value === v), this.uiLang, this.simple).text).join(', ');
    this.voiceStatus = { questionId: q.id, text: this.tr('youSaidChoice', { text, option: shown }) };
    this.render({ focusField: true });
    this.announce(this.voiceStatus.text);
  }

  // ---- read-aloud ------------------------------------------------------------

  /** What "Listen" reads on the current screen: question, hint and options. */
  speechContent() {
    const lang = this.uiLang;
    const tr = (k, v) => this.tr(k, v);
    // Sentences joined with a full stop, unless one already ends with . ? ! or ። ፧
    const join = (...parts) =>
      parts
        .filter(Boolean)
        .map((p) => p.trim())
        .reduce((out, p) => (out ? `${out}${/[.?!።፧]$/.test(out) ? '' : '.'} ${p}` : p), '');
    if (this.step === SETUP) return { text: join(tr('setupTitle'), tr('setupIntro')) };
    if (this.step === DONE) return { text: join(tr('doneTitle'), tr('doneBody')) };
    if (this.step === REVIEW) {
      const items = this.view.querySelectorAll('.op-review-item');
      return { text: join(tr('reviewTitle'), tr('reviewIntro'), ...[...items].map((i) => `${i.querySelector('dt').textContent}: ${i.querySelector('dd').textContent}`)) };
    }
    const q = this.nav.question(this.step);
    const options =
      q.type === 'yesno' ? [tr('yes'), tr('no')] : (q.options ?? []).map((o) => labelOf(o, lang, this.simple).text);
    return {
      text: join(labelOf(q, lang, this.simple).text, pick(q.hint, lang).text, options.length ? `${tr('choices')} ${options.join(', ')}` : ''),
      audioUrl: q.audio?.[lang],
    };
  }

  canSpeak() {
    if (!this.prefs?.readAloud) return false;
    const { audioUrl } = this.speechContent();
    return getSpeech().isAvailable(this.uiLang, { audioUrl });
  }

  speakCurrent() {
    if (!this.canSpeak()) return;
    const { text, audioUrl } = this.speechContent();
    const token = {};
    this.speechToken = token;
    this.setSpeaking(true);
    Promise.resolve()
      .then(() => getSpeech().speak(text, this.uiLang, { audioUrl }))
      .catch(() => {})
      .finally(() => {
        if (this.speechToken === token) this.setSpeaking(false);
      });
  }

  toggleSpeech() {
    if (this.speaking) this.stopSpeech();
    else this.speakCurrent();
  }

  stopSpeech() {
    if (!this.speaking) return;
    this.speechToken = null;
    getSpeech().stop();
    this.setSpeaking(false);
  }

  setSpeaking(on) {
    this.speaking = on;
    // Update the button in place so keyboard focus stays on it.
    const b = this.view.querySelector('.op-listen');
    if (b) setText(b, this.tr(on ? 'stopReading' : 'listen'));
  }

  stopHelpers({ announce = false } = {}) {
    const wasListening = this.listening;
    this.stopSpeech();
    this.stopListening?.();
    if (announce && wasListening) this.announce(this.tr('stopped'));
  }

  // Read the new screen once, but only when the learner turned read-aloud on
  // and moved there themselves (never on page load, never by default).
  autoSpeak(focus) {
    if (focus && this.prefs?.readAloud) this.speakCurrent();
  }

  openSetup({ focus = true } = {}) {
    this.stopHelpers();
    this.setupOpen = true;
    this.render({ focus });
    this.autoSpeak(focus);
    this.emit('openpath:step', { flowId: this.flow.flowId, stepId: SETUP, index: 0, total: this.nav.position(null, this.store.state.answers).total });
  }

  closeSetup(choices) {
    const available = this.helperAvailability();
    const next = { chosen: true };
    for (const k of HELPERS) next[k] = Boolean(choices[k]) && (k in available ? available[k] : true);
    // Turning voice off and on again asks for consent again.
    if (!next.voice) next.voiceConsent = this.prefs.voiceConsent === 'deny' ? null : this.prefs.voiceConsent;
    this.setPrefs(next);
    if (next.voice) loadVoiceModule().catch(() => {}); // load voice code only once it's chosen
    this.syncAccessAnswer();
    this.setupOpen = false;
    this.go(this.store.state.step ?? this.nav.first(this.store.state.answers));
  }

  // Keep an access question (setsPreference: "access") in step with the helpers.
  syncAccessAnswer() {
    const q = this.flow.questions.find((x) => x.setsPreference === 'access');
    if (!q) return;
    const current = this.store.state.answers[q.id];
    const keep = (Array.isArray(current) ? current : []).filter((v) => !(v in ACCESS_TO_HELPER));
    const values = [...new Set([...keep, ...helpersToAccess(this.prefs, q)])];
    const ordered = q.options.map((o) => o.value).filter((v) => values.includes(v));
    this.store.setAnswer(q.id, ordered.length ? ordered : undefined);
  }

  accessAnswerChanged(question, values) {
    const on = new Set(Array.isArray(values) ? values : []);
    const available = this.helperAvailability();
    const changes = {};
    for (const o of question.options) {
      const helper = ACCESS_TO_HELPER[o.value];
      if (helper) changes[helper] = on.has(o.value) && (helper in available ? available[helper] : true);
    }
    this.setPrefs(changes);
  }

  announce(text) {
    // Clear first so the same message is announced again.
    this.live.textContent = '';
    setTimeout(() => {
      setText(this.live, text);
    }, 50);
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  get step() {
    if (this.done) return DONE;
    if (this.setupOpen) return SETUP;
    return this.store.state.step;
  }

  get simple() {
    return Boolean(this.prefs?.simple);
  }

  tr(key, vars) {
    return t(this.uiLang, key, vars, this.simple);
  }

  go(step, { focus = true, returnToReview } = {}) {
    this.stopHelpers(); // speech and listening stop on every step change
    this.voiceStatus = null;
    this.setupOpen = false;
    if (step !== this.step || returnToReview !== undefined) this.store.setStep(step, returnToReview === undefined ? {} : { returnToReview });
    if (step !== REVIEW) this.submitError = null;
    this.render({ focus });
    this.autoSpeak(focus);
    const { index, total } = step === REVIEW ? { index: 0, total: this.nav.position(step, this.store.state.answers).total } : this.nav.position(step, this.store.state.answers);
    this.emit('openpath:step', { flowId: this.flow.flowId, stepId: step, index, total });
  }

  render(opts = {}) {
    this.renderView(opts);
    // "Listen" goes first in the tools row, only when read-aloud is on and works here.
    if (this.canSpeak()) {
      this.view.querySelector('.op-tools').prepend(
        h('button', { type: 'button', class: 'op-button op-secondary op-small op-listen', onclick: () => this.toggleSpeech(), text: this.tr(this.speaking ? 'stopReading' : 'listen') }),
      );
    }
  }

  renderView({ focus = false, focusField = false } = {}) {
    const lang = this.uiLang;
    const { answers } = this.store.state;
    this.view.textContent = '';
    const title = pick(this.flow.title, lang);
    const header = h(
      'div',
      { class: 'op-header' },
      h('p', { class: 'op-title', ...langAttrs(title.lang, lang), text: title.text }),
    );
    this.view.append(header);
    const tools = h('div', { class: 'op-tools' });
    header.append(tools);
    if (this.step !== DONE && this.step !== SETUP) {
      tools.append(h('button', { type: 'button', class: 'op-button op-secondary op-small', onclick: () => this.openSetup(), text: this.tr('settings') }));
    }

    if (this.step === DONE) return this.renderDone(focus);
    if (this.step === SETUP) {
      const setup = renderSetup({
        tr: (k, v) => this.tr(k, v),
        uid: this.uid,
        prefs: this.prefs,
        available: this.helperAvailability(),
        languages: this.switcherLangs ?? [],
        current: this.uiLang,
        onLanguage: (code) => this.switchLanguage(code),
        onDeviceTools: () => this.closeSetup({}),
        onContinue: (choices) => this.closeSetup(choices),
        // Bigger text and high contrast show straight away (no re-render, focus stays).
        onPreview: (key, on) => {
          if (key === 'largerText' || key === 'highContrast') this.applyPreferences({ ...this.prefs, [key]: on });
        },
      });
      this.view.append(setup.node);
      if (focus) setup.focusHeading();
      return;
    }
    if (this.step === REVIEW) {
      const review = renderReview({
        flow: this.flow,
        answers,
        lang,
        simple: this.simple,
        uid: this.uid,
        busy: this.busy,
        submitError: this.submitError,
        onEdit: (id) => this.go(id, { returnToReview: true }),
        onBack: () => this.go(this.nav.back(REVIEW, answers) ?? REVIEW, { returnToReview: false }),
        onSubmit: () => this.submit(),
      });
      this.view.append(review.node);
      if (focus) review.focusHeading();
      return;
    }

    const q = this.nav.question(this.step);
    const { index, total } = this.nav.position(q.id, answers);
    const error = this.error?.questionId === q.id ? this.error.message : null;
    const step = renderStep({
      q,
      value: answers[q.id],
      lang,
      simple: this.simple,
      error,
      uid: this.uid,
      onChange: (value) => {
        this.store.setAnswer(q.id, value);
        if (q.setsPreference === 'access') this.accessAnswerChanged(q, value);
        // A showIf answer can change the number of steps: update the text in
        // place (no re-render, so focus stays where it is).
        const pos = this.nav.position(q.id, this.store.state.answers);
        const progress = this.view.querySelector('.op-progress');
        if (progress) setText(progress, this.tr('stepOf', { n: pos.index, total: pos.total }));
      },
      // Date questions: the learner switched calendar. Show the other fields,
      // keep focus on the switch and say which calendar is in use now.
      onSwitch: (calendar, message) => {
        this.store.setAnswer(q.id, switchCalendar(this.store.state.answers[q.id], calendar));
        this.error = null;
        this.render();
        this.view.querySelector('.op-calendar-switch')?.focus();
        this.announce(message);
      },
    });

    // The text field always stays; the mic is an extra way to fill it.
    if (this.micAllowed(q)) step.node.append(this.micBlock(q));

    const back = this.nav.back(q.id, answers);
    const form = h(
      'form',
      { class: 'op-form', novalidate: true, onsubmit: (e) => (e.preventDefault(), this.next()) },
      step.node,
      h(
        'div',
        { class: 'op-nav' },
        back ? h('button', { type: 'button', class: 'op-button op-secondary', onclick: () => this.back(), text: this.tr('back') }) : null,
        !q.required && q.type !== 'info'
          ? h('button', { type: 'button', class: 'op-button op-secondary', onclick: () => this.skip(), text: this.tr('skip') })
          : null,
        h('button', { type: 'submit', class: 'op-button op-primary', text: this.tr('next') }),
      ),
    );
    this.view.append(h('p', { class: 'op-progress', text: this.tr('stepOf', { n: index, total }) }), form);
    if (focusField) step.focusField();
    else if (focus) this.view.querySelector('.op-question')?.focus();
  }

  renderDone(focus) {
    const heading = h('h2', { class: 'op-question', tabindex: '-1', text: this.tr('doneTitle') });
    this.view.append(h('div', { class: 'op-step' }, heading, h('p', { class: 'op-body', text: this.tr('doneBody') })));
    if (focus) heading.focus();
  }

  next() {
    const q = this.nav.question(this.step);
    const { answers } = this.store.state;
    const code = validateAnswer(q, answers[q.id]);
    if (code) {
      const message = errorMessage(this.uiLang, q, code, this.simple, {}, answers[q.id]);
      this.error = { questionId: q.id, message };
      this.render({ focusField: true });
      this.announce(message);
      return;
    }
    this.error = null;
    // Keep the answer as it will be stored, e.g. phone numbers as +251911234567.
    if (answers[q.id] !== undefined && q.type !== 'info') {
      const stored = cleanAnswer(q, answers[q.id]);
      if (JSON.stringify(stored) !== JSON.stringify(answers[q.id])) this.store.setAnswer(q.id, stored);
    }
    const target = this.store.state.returnToReview ? REVIEW : this.nav.next(q.id, answers);
    this.go(target, { returnToReview: false });
    this.save({ announce: q.type !== 'info' });
  }

  back() {
    this.error = null;
    const prev = this.nav.back(this.step, this.store.state.answers);
    if (prev) this.go(prev, { returnToReview: false });
  }

  skip() {
    const q = this.nav.question(this.step);
    this.store.setAnswer(q.id, undefined);
    this.error = null;
    const target = this.store.state.returnToReview ? REVIEW : this.nav.next(q.id, this.store.state.answers);
    this.go(target, { returnToReview: false });
    this.save({ announce: true });
  }

  /** Answers are already in localStorage; also send them to the API if there is one. */
  save({ announce = false } = {}) {
    if (!this.api) {
      if (announce) this.announce(this.tr('saved'));
      return this.saveChain;
    }
    this.saveChain = this.saveChain.then(async () => {
      try {
        await this.pushAnswers();
        if (announce) this.announce(this.tr('saved'));
      } catch {
        if (announce) this.announce(this.tr('savedLocal'));
      }
    });
    return this.saveChain;
  }

  async ensureSession() {
    if (this.store.state.sessionId) return this.store.state.sessionId;
    const s = await this.api.createSession(this.flow.flowId, this.uiLang);
    this.store.setSession(s.id, s.resumeCode);
    return s.id;
  }

  async pushAnswers(retry = true) {
    const id = await this.ensureSession();
    try {
      await this.api.saveAnswers(id, this.store.state.answers, this.step === DONE ? null : this.step);
    } catch (e) {
      if (retry && e instanceof ApiError && (e.status === 404 || e.code === 'already_submitted')) {
        this.store.setSession(null, null);
        return this.pushAnswers(false);
      }
      throw e;
    }
  }

  async submit() {
    const { answers } = this.store.state;
    const { errors, clean } = validateAnswers(this.flow, answers, { mode: 'submit' });
    if (errors.length) {
      const first = errors[0];
      const q = this.nav.question(first.field);
      if (!q) return;
      const message = errorMessage(this.uiLang, q, first.code, this.simple, {}, answers[q.id]);
      this.error = { questionId: q.id, message };
      this.store.setStep(q.id, { returnToReview: true });
      this.render({ focusField: true });
      this.announce(`${this.tr('fixBeforeSubmit')} ${message}`);
      return;
    }

    // Update the button in place so keyboard focus stays on it while sending.
    this.busy = true;
    const button = this.view.querySelector('.op-primary');
    if (button) {
      button.setAttribute('aria-disabled', 'true');
      setText(button, this.tr('submitting'));
    }
    this.announce(this.tr('submitting'));
    let sessionId = null;
    if (this.api) {
      try {
        await this.saveChain;
        sessionId = await this.ensureSession();
        await this.api.submit(sessionId, answers);
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'already_submitted')) {
          this.busy = false;
          this.submitError = this.tr('submitFailed');
          this.render();
          this.view.querySelector('.op-primary')?.focus();
          this.announce(this.submitError);
          return;
        }
      }
    }

    const publicAnswers = Object.fromEntries(
      Object.entries(clean).filter(([id]) => !this.nav.question(id).private),
    );
    this.busy = false;
    this.store.clear();
    this.done = true; // not persisted: a reload starts a fresh form
    this.render({ focus: true });
    this.autoSpeak(true);
    this.emit('openpath:complete', { flowId: this.flow.flowId, sessionId, answers: publicAnswers });
  }
}
