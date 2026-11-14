import { cleanAnswer, validateAnswer, validateAnswers } from '../../shared/flow.js';
import { ApiError, createApi, isUnreachable, newClientKey } from './api.js';
import { h, setText } from './dom.js';
import { loadFlow } from './loader.js';
import { folderUrl, resolveLanguages, themeFor } from './language.js';
import { errorMessage, FALLBACK_LANG, labelOf, langAttrs, packInfo, pick, t, tList } from './messages.js';
import { createNavigator, REVIEW } from './navigator.js';
import { earlierAnswer, forgetEntries, forgetProfile, hasProfile, saveProfile } from './profile.js';
import { ACCESS_TO_HELPER, HELPERS, helpersToAccess, loadPrefs, savePrefs } from './prefs.js';
import { getSpeech, getVoice, loadVoiceModule, serverLang, speechServerFrom, voiceAvailable, voiceKind } from './providers.js';
import { renderReview } from './review.js';
import { renderSetup } from './setup.js';
import { switchCalendar } from './steps/date.js';
import { renderStep } from './steps/index.js';
import { createStore } from './store.js';
import css from './styles.css?inline';

let counter = 0;
const DONE = 'done';
const SETUP = 'setup';
// First screen when the host offers several languages. The hyphen keeps it
// apart from question ids (a question may well be called "language").
const LANGUAGE = 'choose-language';
const QUEUED = 'queued'; // answers wait on the device until the server can be reached
const RETRY_MS = 20000;

/**
 * <openpath-flow questions="/questions/onboarding.json" api="http://localhost:4000" lang="en"
 *                languages="am,en,ar" lang-path="/openpath/lang/">
 *
 * lang:      starting language (default en). Packs other than English are fetched
 *            from lang-path (default: the "lang" folder next to openpath.js).
 * languages: optional; shows a language switcher on the first screen and in Settings.
 * theme:     "light" (default), "dark", or "auto" (follow the device's dark mode).
 *            The learner can also choose "Dark colours" in Settings.
 * flow:      a flow by name instead of a questions URL: flow="job-application" loads
 *            job-application.json from flows-path (default: "questions" next to openpath.js).
 * .context:  optional property, e.g. { jobId, jobTitle }: sent with the session and
 *            included in openpath:complete (set by <openpath-jobs>).
 *
 * When the API can't be reached the form keeps working: answers stay on the
 * device, a note says they will be sent when the learner is back online,
 * and saving (and a pressed "Send") is retried when the connection returns
 * and every 20 seconds. Every request is safe to repeat.
 *
 * Events (bubble and cross the shadow boundary):
 *   openpath:step      detail { flowId, stepId, index, total }
 *   openpath:complete  detail { flowId, sessionId, answers, context? }  (private answers left out)
 *   openpath:queued    detail { flowId }  "Send" was pressed offline; sent later
 */
export class OpenPathFlow extends HTMLElement {
  static get observedAttributes() {
    return ['lang', 'languages', 'lang-path', 'theme'];
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

  /**
   * Load the packs needed (the wanted language and every switcher language,
   * so each option can show its own name) and switch to the wanted one.
   * A pack that fails to load means English. Returns false if a newer
   * call took over.
   */
  async resolveLanguage() {
    const token = {};
    this.langToken = token;
    const { lang, switcher } = await resolveLanguages(this, this.prefs);
    if (this.langToken !== token) return false;
    this.activeLang = lang;
    this.switcherLangs = switcher;
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
    // Back online: send what is waiting.
    this.onOnline = () => this.retryNow();
    globalThis.addEventListener?.('online', this.onOnline);
    this.ready = this.start();
  }

  disconnectedCallback() {
    this.stopHelpers();
    this.stopRetry();
    globalThis.removeEventListener?.('online', this.onOnline);
  }

  attributeChangedCallback(name, oldValue, value) {
    if (name === 'theme') return this.root && this.applyPreferences();
    if (!this.flow || oldValue === value) return;
    // A host that sets lang later means it: it replaces a saved choice.
    if (name === 'lang' && this.prefs?.lang) this.setPrefs({ lang: null });
    this.resolveLanguage().then((ok) => ok && this.render());
  }

  /** The question file: questions="url", or flow="name" from the flows folder. */
  questionsUrl() {
    const url = this.getAttribute('questions');
    const name = this.getAttribute('flow');
    if (url || !name) return url;
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) return null;
    return `${folderUrl(this, 'flows-path', 'questions/')}${name}.json`;
  }

  async start() {
    this.prefs = loadPrefs();
    const named = !this.getAttribute('questions') && this.hasAttribute('flow');
    const [{ flow }] = await Promise.all([
      named && !this.questionsUrl() ? { flow: null } : loadFlow(this.questionsUrl(), { fallback: !named }),
      this.resolveLanguage(),
    ]);
    if (!flow) {
      this.view.textContent = '';
      this.view.append(h('p', { class: 'op-error', text: this.tr('formFailed') }));
      return;
    }
    this.flow = flow;
    this.store = createStore(flow, { scope: this.context?.jobId });
    this.prefillEarlierAnswers();
    this.nav = createNavigator(flow);
    const api = this.getAttribute('api');
    this.api = api ? createApi(api) : null;
    this.applyPreferences();

    if (this.api) {
      // Find out early whether the server can be reached (doesn't hold up the form).
      this.api.health().then(
        () => this.setOffline(false),
        (e) => isUnreachable(e) && this.setOffline(true),
      );
      // Which languages the server can turn into text, and who does it. Wait
      // briefly only when voice input may be offered on the first screen.
      const caps = this.api.speechCapabilities().then(
        (c) => (this.speechServer = speechServerFrom(c, this.api)),
        () => null,
      );
      if (!this.prefs.chosen || this.prefs.voice) await Promise.race([caps, new Promise((r) => setTimeout(r, 1500))]);
      // "Send" was pressed offline last time: keep waiting, and try again now.
      if (this.store.state.pendingSubmit) {
        this.queued = true;
        this.render();
        this.startRetry();
        this.retryNow();
        return;
      }
    }
    if (this.api && this.store.state.sessionId) await this.checkSession();
    const step = this.nav.resolve(this.store.state.step, this.store.state.answers);
    if (step !== this.store.state.step) this.store.setStep(step);
    // Browser voices load late; wait briefly only when read-aloud may be offered.
    if (!this.prefs.chosen || this.prefs.readAloud) await getSpeech().whenReady?.(1000);
    // First visit: the language (when several are offered), then how the
    // learner wants to use the form.
    if (this.needsLanguage()) this.openLanguage({ focus: false });
    else if (!this.prefs.chosen) this.openSetup({ focus: false });
    else this.go(step, { focus: false });
  }

  /** Several languages offered and the learner hasn't chosen one yet. */
  needsLanguage() {
    const offered = this.switcherLangs ?? [];
    return offered.length > 1 && !offered.some((l) => l.code === this.prefs?.lang);
  }

  openLanguage({ focus = true } = {}) {
    this.stopHelpers();
    this.languageOpen = true;
    this.render({ focus });
    this.emit('openpath:step', { flowId: this.flow.flowId, stepId: LANGUAGE, index: 0, total: this.nav.position(null, this.store.state.answers).total });
  }

  /** The language screen: a heading in every offered language and one big button per language. */
  renderLanguage(focus) {
    const headingId = `op-${this.uid}-language-heading`;
    const seen = new Set();
    const parts = [];
    for (const l of this.switcherLangs) {
      const text = t(l.code, 'chooseLanguage');
      if (seen.has(String(text))) continue; // a pack without its own wording falls back to English
      seen.add(String(text));
      if (parts.length) parts.push(h('span', { 'aria-hidden': 'true', text: ' · ' }));
      parts.push(h('span', { lang: text.lang ?? l.code, dir: text.dir ?? l.dir, text: String(text) }));
    }
    const heading = h('h2', { id: headingId, class: 'op-question op-language-heading', tabindex: '-1' }, parts);
    const buttons = this.switcherLangs.map((l) =>
      h('button', {
        type: 'button',
        class: 'op-button op-secondary op-wide op-lang-choice',
        lang: l.code,
        dir: l.dir,
        'data-lang': l.code,
        text: l.name,
        onclick: () => this.chooseFirstLanguage(l.code),
      }),
    );
    this.view.append(h('div', { class: 'op-step op-language' }, heading, h('div', { role: 'group', 'aria-labelledby': headingId, class: 'op-lang-choices' }, buttons)));
    if (focus) heading.focus();
  }

  async chooseFirstLanguage(code) {
    this.setPrefs({ lang: code });
    if (!(await this.resolveLanguage())) return;
    this.languageOpen = false;
    // The whole form now continues in that language.
    if (!this.prefs.chosen) this.openSetup({ focus: true });
    else this.go(this.store.state.step ?? this.nav.first(this.store.state.answers));
  }

  // A saved session that was submitted elsewhere, or no longer exists, starts over.
  async checkSession() {
    try {
      const s = await this.api.getSession(this.store.state.sessionId);
      if (s.status !== 'open') this.store.clear();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) this.forgetSession();
      if (isUnreachable(e)) this.setOffline(true);
    }
  }

  /**
   * Questions with "prefillFrom" start with the learner's earlier answer
   * (WCAG 3.3.7), so they don't type their name and phone again. The step
   * says it was filled in and can be changed.
   */
  prefillEarlierAnswers() {
    this.prefilled = new Set();
    for (const q of this.flow.questions) {
      if (!q.prefillFrom || this.store.state.answers[q.id] !== undefined) continue;
      for (const source of [].concat(q.prefillFrom)) {
        const value = earlierAnswer(source);
        if (value === undefined || validateAnswer(q, value, { checkRequired: false })) continue;
        this.store.setAnswer(q.id, value);
        this.prefilled.add(q.id);
        break;
      }
    }
  }

  forgetSession() {
    this.store.setSession(null, null);
    this.store.setClientKey(null);
  }

  // ---- offline -----------------------------------------------------------------

  /** Show or hide the "saved on this device" note, in place (focus stays). */
  setOffline(on) {
    this.offline = on;
    const note = this.view?.querySelector('.op-offline');
    if (!on) return note?.remove();
    if (!note && this.flow) this.view.querySelector('.op-header')?.after(this.offlineNote());
  }

  offlineNote() {
    return h('p', { class: 'op-offline', text: this.tr('savedOffline') });
  }

  startRetry() {
    this.retryTimer ??= setInterval(() => this.retryNow(), RETRY_MS);
  }

  stopRetry() {
    clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  /** Try again to send what is waiting: a pressed "Send", or the latest answers. */
  retryNow() {
    if (!this.api || !this.store) return this.saveChain;
    // Already trying: try once more after it (the connection may have just come back).
    if (this.retrying) {
      this.retryAgain = true;
      return this.saveChain.then(() => this.saveChain);
    }
    this.retrying = true;
    this.retryAgain = false;
    this.saveChain = this.saveChain
      .then(async () => {
        if (this.store.state.pendingSubmit) return this.flushSubmit();
        try {
          await this.pushAnswers();
          this.setOffline(false);
          this.stopRetry();
        } catch (e) {
          if (!isUnreachable(e)) this.stopRetry(); // the server answered; nothing to wait for
        }
      })
      .finally(() => {
        this.retrying = false;
        if (this.retryAgain) this.retryNow();
      });
    return this.saveChain;
  }

  queueSubmit() {
    this.busy = false;
    this.store.setPendingSubmit(true);
    this.queued = true;
    this.setOffline(true);
    this.render({ focus: true });
    this.announce(this.tr('savedOffline'));
    this.startRetry();
    this.emit('openpath:queued', { flowId: this.flow.flowId });
  }

  /** Send a submit that waited offline. */
  async flushSubmit() {
    const { answers } = this.store.state;
    let sessionId;
    try {
      sessionId = await this.sendSubmit(answers);
    } catch (e) {
      if (isUnreachable(e)) return; // still offline: keep waiting
      // The server refused the answers: back to the review to fix them.
      this.stopRetry();
      this.store.setPendingSubmit(false);
      this.queued = false;
      this.submitError = this.submitFailedMessage(e);
      this.store.setStep(REVIEW);
      this.render({ focus: true });
      this.announce(this.submitError);
      return;
    }
    this.stopRetry();
    this.setOffline(false);
    const { clean } = validateAnswers(this.flow, answers, { mode: 'submit' });
    // Move focus only if the learner is still in the form.
    this.finish(sessionId, clean, { focus: Boolean(this.shadowRoot.activeElement) });
    this.announce(this.tr('sentNow'));
  }

  renderQueued(focus) {
    const heading = h('h2', { class: 'op-question', tabindex: '-1', text: this.tr('queuedTitle') });
    this.view.append(
      h(
        'div',
        { class: 'op-step' },
        heading,
        h('p', { class: 'op-body', text: this.tr('queuedBody') }),
        h(
          'div',
          { class: 'op-nav' },
          h('button', {
            type: 'button',
            class: 'op-button op-secondary',
            text: this.tr('editAnswers'),
            onclick: () => {
              this.stopRetry();
              this.store.setPendingSubmit(false);
              this.queued = false;
              this.go(REVIEW, { returnToReview: false });
            },
          }),
          h('button', {
            type: 'button',
            class: 'op-button op-primary',
            text: this.tr('trySendNow'),
            onclick: async () => {
              await this.retryNow();
              if (this.queued) this.announce(this.tr('savedOffline'));
            },
          }),
        ),
      ),
    );
    if (focus) heading.focus();
  }

  applyPreferences(prefs = this.prefs) {
    this.root.toggleAttribute('data-larger-text', Boolean(prefs?.largerText));
    this.root.toggleAttribute('data-high-contrast', Boolean(prefs?.highContrast));
    this.root.setAttribute('data-theme', themeFor(this, prefs));
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
      voice: voiceAvailable(lang, this.speechServer),
    };
  }

  // ---- voice input -----------------------------------------------------------

  /** Voice is on for every question that takes an answer, unless the question says "voice": false. */
  micAllowed(q) {
    return (
      Boolean(this.prefs?.voice) &&
      q.voice !== false &&
      q.type !== 'info' &&
      this.prefs.voiceConsent !== 'deny' &&
      voiceAvailable(this.uiLang, this.speechServer)
    );
  }

  /**
   * Which voice input this language uses, and where the voice goes: the
   * server's provider when it transcribes this language, otherwise the
   * browser's recogniser (or the host's provider).
   */
  voiceTarget() {
    const kind = voiceKind(this.uiLang, this.speechServer);
    return kind === 'server'
      ? { kind, consentFor: `server:${this.speechServer.label}`, provider: this.speechServer.label }
      : { kind, consentFor: 'browser' };
  }

  /** Consent covers one destination: a new one (another language, another provider) asks again. */
  voiceConsented() {
    return this.prefs.voiceConsent === 'allow' && (this.prefs.voiceConsentFor ?? 'browser') === this.voiceTarget().consentFor;
  }

  /** The mic button and a status line under it. Its text label says what it
   *  will do ("Speak your answer" / "Stop listening"); no aria-pressed, so the
   *  state isn't announced twice. */
  micBlock(q, { withButton = true } = {}) {
    const status = this.voiceStatus?.questionId === q.id ? this.voiceStatus.text : '';
    // Private answers: speaking out loud can be overheard. Say so next to the mic.
    const privacyId = q.private ? `op-${this.uid}-${q.id}-voice-privacy` : undefined;
    return h(
      'div',
      { class: 'op-voice' },
      withButton ? this.micButton(q, { describedBy: privacyId }) : null,
      privacyId ? h('p', { id: privacyId, class: 'op-hint op-voice-privacy', text: this.tr('voicePrivacy') }) : null,
      h('p', { class: 'op-voice-status', text: status }),
    );
  }

  /** A mic button: for the whole answer, or for one date list (part = day, month or year). */
  micButton(q, { part, describedBy } = {}) {
    return h('button', {
      type: 'button',
      class: 'op-button op-secondary op-mic',
      'data-part': part,
      'aria-describedby': describedBy,
      onclick: () => this.micClicked(q, part),
      text: this.tr(part ? `speak_${part}` : 'speakAnswer'),
    });
  }

  /** Date questions: "Say the day", "Say the month" and "Say the year" under each list. */
  addDateMics(q, node) {
    for (const partNode of node.querySelectorAll('.op-date-part')) {
      const part = ['day', 'month', 'year'].find((p) => partNode.querySelector(`.op-date-${p}`));
      if (part) partNode.append(this.micButton(q, { part }));
    }
  }

  micClicked(q, part) {
    if (this.listening) {
      if (!this.transcribing) this.listenProvider?.stop(); // listen() then settles with what was heard
      return;
    }
    if (this.voiceConsented()) this.startListening(q, part);
    else this.showConsent(q, part);
  }

  showConsent(q, part) {
    const block = this.view.querySelector('.op-voice');
    const textId = `op-${this.uid}-consent`;
    const target = this.voiceTarget();
    // Name where the audio goes: the provider the server names, or the browser's service.
    const message = target.kind === 'server' ? this.tr('consentServer', { provider: target.provider }) : this.tr('consentText');
    const text = h('p', { id: textId, class: 'op-consent-text', tabindex: '-1', text: message });
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
              this.setPrefs({ voiceConsent: 'allow', voiceConsentFor: target.consentFor });
              this.render();
              this.micFor(part)?.focus();
              this.startListening(q, part);
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

  micFor(part) {
    return this.view.querySelector(part ? `.op-mic[data-part="${part}"]` : '.op-mic');
  }

  setMic(on) {
    const b = this.micFor(this.activePart);
    if (!b) return;
    b.classList.toggle('op-mic-on', on);
    // While a recording is turned into text the button can't do anything.
    if (this.transcribing) b.setAttribute('aria-disabled', 'true');
    else b.removeAttribute('aria-disabled');
    setText(b, this.tr(this.transcribing ? 'transcribing' : on ? 'stopListening' : this.activePart ? `speak_${this.activePart}` : 'speakAnswer'));
  }

  setVoiceStatus(q, text) {
    this.voiceStatus = { questionId: q.id, text };
    const p = this.view.querySelector('.op-voice-status');
    if (p) setText(p, text);
    this.announce(text);
  }

  async startListening(q, part) {
    this.stopSpeech(); // don't let read-aloud talk into the microphone
    const token = {};
    this.listenToken = token;
    this.activePart = part;
    const target = this.voiceTarget();
    let mod;
    try {
      mod = await loadVoiceModule();
      this.listenProvider = await getVoice(target.kind, this.speechServer);
    } catch {
      return this.setVoiceStatus(q, this.tr('voice_failed'));
    }
    if (this.listenToken !== token) return;
    this.listening = true;
    this.transcribing = false;
    this.setMic(true);
    // A server recording doesn't end by itself when the learner stops talking.
    this.announce(this.tr(target.kind === 'server' ? 'listeningServer' : 'listening'));
    const lang = target.kind === 'server' ? serverLang(this.uiLang, this.speechServer) : this.uiLang;
    const onRecorded = () => {
      if (this.listenToken !== token) return;
      this.transcribing = true;
      this.setMic(true);
      this.setVoiceStatus(q, this.tr('transcribing'));
    };
    let text;
    try {
      text = String((await this.listenProvider.listen(lang, { onRecorded })) ?? '').trim();
      if (!text) throw Object.assign(new Error('no_speech'), { code: 'no_speech' });
    } catch (e) {
      if (this.listenToken !== token) return; // stopped by a step change or Escape
      this.listening = false;
      this.transcribing = false;
      this.setMic(false);
      if (e?.code === 'aborted') return this.setVoiceStatus(q, this.tr('stopped'));
      const known = ['permission', 'no_speech', 'offline', 'no_microphone', 'busy'];
      return this.setVoiceStatus(q, this.tr(`voice_${known.includes(e?.code) ? e.code : 'failed'}`));
    }
    if (this.listenToken !== token) return;
    this.listening = false;
    this.transcribing = false;
    this.setMic(false);
    this.useSpokenAnswer(q, text, mod, part);
  }

  stopListening() {
    if (!this.listening) return;
    this.listenToken = null;
    this.listening = false;
    this.transcribing = false;
    // Escape or a step change: throw a server recording away unsent.
    if (typeof this.listenProvider?.cancel === 'function') this.listenProvider.cancel();
    else this.listenProvider?.stop();
    this.setMic(false);
  }

  // Put what was said into the answer, tell the learner, and give focus to
  // the field. Never moves on by itself.
  useSpokenAnswer(q, text, mod, part) {
    if (q.type === 'date') return this.useSpokenDatePart(q, text, mod, part);
    // Long text: what was said is added to what is already there, so the
    // learner can speak several times (and edit in between).
    if (q.type === 'text' && q.multiline) {
      const field = this.view.querySelector('.op-input');
      const before = field.value.replace(/\s+$/, '');
      const value = before ? `${before} ${text}` : text;
      field.value = value;
      this.store.setAnswer(q.id, value);
      field.focus();
      field.setSelectionRange?.(value.length, value.length);
      return this.setVoiceStatus(q, this.tr('voiceAdded', { text }));
    }
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

  /** A spoken day, month or year for one date list: matched in the current language. */
  useSpokenDatePart(q, text, mod, part) {
    const field = this.view.querySelector(`.op-date-${part}`);
    if (!field) return;
    const ethiopian = field.tagName === 'SELECT';
    const lang = this.uiLang;
    const monthKey = ethiopian ? 'ethiopianMonths' : 'gregorianMonths';
    const lists = [tList(lang, monthKey), tList(FALLBACK_LANG, monthKey), ethiopian ? tList('am', monthKey) : []];
    const months = Array.from({ length: ethiopian ? 13 : 12 }, (_, i) => lists.map((l) => l[i]).filter(Boolean));
    const years = ethiopian ? [...field.options].map((o) => Number(o.value)).filter(Boolean) : [1900, new Date().getFullYear()];
    const range = { day: [1, ethiopian ? 30 : 31], month: [1, ethiopian ? 13 : 12], year: [Math.min(...years), Math.max(...years)] }[part];
    const value = mod.matchDatePart(text, {
      min: range[0],
      max: range[1],
      months: part === 'month' ? months : [],
      numberWords: part === 'year' ? [] : [...tList(lang, 'voiceNumbers')].length ? tList(lang, 'voiceNumbers') : tList(FALLBACK_LANG, 'voiceNumbers'),
    });
    if (value === undefined) {
      this.setVoiceStatus(q, this.tr('noMatch', { text }));
      field.focus();
      return;
    }
    field.value = String(value);
    field.dispatchEvent(new Event(ethiopian ? 'change' : 'input', { bubbles: true }));
    field.focus();
    const shown = ethiopian ? field.selectedOptions[0]?.textContent ?? String(value) : String(value);
    this.setVoiceStatus(q, this.tr('youSaidChoice', { text, option: shown }));
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
    if (this.step === LANGUAGE) return { text: tr('chooseLanguage') };
    if (this.step === DONE) return { text: join(tr('doneTitle'), tr('doneBody')) };
    if (this.step === QUEUED) return { text: join(tr('queuedTitle'), tr('queuedBody')) };
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
    // Clear first so the same message is announced again. A newer message
    // replaces one that has not been announced yet.
    this.announced = (this.announced ?? 0) + 1;
    clearTimeout(this.announceTimer);
    this.live.textContent = '';
    this.announceTimer = setTimeout(() => {
      setText(this.live, text);
    }, 50);
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  get step() {
    if (this.done) return DONE;
    if (this.queued) return QUEUED;
    if (this.languageOpen) return LANGUAGE;
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
    if (this.offline) this.view.append(this.offlineNote());
    if (![DONE, SETUP, QUEUED, LANGUAGE].includes(this.step)) {
      tools.append(h('button', { type: 'button', class: 'op-button op-secondary op-small', onclick: () => this.openSetup(), text: this.tr('settings') }));
    }

    if (this.step === DONE) return this.renderDone(focus);
    if (this.step === QUEUED) return this.renderQueued(focus);
    if (this.step === LANGUAGE) return this.renderLanguage(focus);
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
        detailsKept: hasProfile(),
        onForgetDetails: () => forgetProfile(),
        onContinue: (choices) => this.closeSetup(choices),
        // Bigger text and high contrast show straight away (no re-render, focus stays).
        onPreview: (key, on) => {
          if (key === 'largerText' || key === 'highContrast' || key === 'dark') this.applyPreferences({ ...this.prefs, [key]: on });
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
        this.prefilled?.delete(q.id); // the learner's own answer now
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
    if (this.prefilled?.has(q.id)) {
      const noteId = `op-${this.uid}-${q.id}-prefilled`;
      step.node.append(h('p', { id: noteId, class: 'op-hint op-prefilled', text: this.tr('prefilled') }));
      const field = step.node.querySelector(`#op-${this.uid}-${q.id}-field`);
      if (field) field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), noteId].filter(Boolean).join(' '));
    }
    if (this.micAllowed(q)) {
      if (q.type === 'date') {
        this.addDateMics(q, step.node);
        step.node.append(this.micBlock(q, { withButton: false })); // the status line under the lists
      } else step.node.append(this.micBlock(q));
    }

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
    const step = h('div', { class: 'op-step' }, heading, h('p', { class: 'op-body', text: this.tr('doneBody') }));
    // Ask before keeping anything on this device (it may be shared). No is the default:
    // leaving this screen without answering keeps nothing.
    if (this.profileOffer) step.append(this.rememberQuestion());
    // Say plainly what is kept on this device for next time, and let the learner forget it.
    else if (this.profileKept) {
      const note = h('p', { class: 'op-body op-profile-note', text: this.tr('profileKept') });
      step.append(note, this.forgetButton(note));
    }
    this.view.append(step);
    if (focus) heading.focus();
  }

  /** "Remember my name and phone on this device for job applications?" No comes first. */
  rememberQuestion() {
    const legendId = `op-${this.uid}-remember`;
    const box = h('div', { class: 'op-group op-remember', role: 'group', 'aria-labelledby': legendId });
    const answer = (yes) => {
      const keep = this.profileOffer;
      this.profileOffer = null;
      // No also clears older copies of these answers, so the last person's name
      // is not offered to the next person on a shared computer.
      if (yes) this.profileKept = saveProfile(keep);
      else forgetEntries(Object.keys(keep));
      const note = h('p', { class: 'op-body op-profile-note', tabindex: '-1', text: this.tr(this.profileKept ? 'profileKept' : 'profileNotKept') });
      box.replaceWith(note);
      if (this.profileKept) note.after(this.forgetButton(note));
      note.focus();
    };
    box.append(
      h('p', { id: legendId, class: 'op-legend op-subheading', text: this.tr('rememberProfileQuestion') }),
      h('p', { class: 'op-hint', text: this.tr('rememberProfileHint') }),
      h(
        'div',
        { class: 'op-nav' },
        h('button', { type: 'button', class: 'op-button op-primary', onclick: () => answer(false), text: this.tr('rememberProfileNo') }),
        h('button', { type: 'button', class: 'op-button op-secondary', onclick: () => answer(true), text: this.tr('rememberProfileYes') }),
      ),
    );
    return box;
  }

  forgetButton(note) {
    const forget = h('button', {
      type: 'button',
      class: 'op-button op-secondary',
      text: this.tr('forgetProfile'),
      onclick: () => {
        forgetProfile();
        this.profileKept = false;
        setText(note, this.tr('profileForgotten'));
        forget.remove();
        note.setAttribute('tabindex', '-1');
        note.focus();
      },
    });
    return forget;
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
    // The server may answer late: by then the learner may have caused a newer
    // message (an error on the next step). "Saved" must never replace it.
    const mark = this.announced ?? 0;
    const say = (key) => announce && (this.announced ?? 0) === mark && this.announce(this.tr(key));
    this.saveChain = this.saveChain.then(async () => {
      try {
        await this.pushAnswers();
        this.setOffline(false);
        say('saved');
      } catch (e) {
        if (isUnreachable(e)) {
          // Kept on the device; sent when the connection returns. The note says so too.
          this.setOffline(true);
          this.startRetry();
          say('savedOffline');
        } else say('savedLocal');
      }
    });
    return this.saveChain;
  }

  async ensureSession() {
    if (this.store.state.sessionId) return this.store.state.sessionId;
    // The same key on every retry: if a reply was lost, the server returns
    // the session it already made instead of a second one.
    if (!this.store.state.clientKey) this.store.setClientKey(newClientKey());
    const s = await this.api.createSession(this.flow.flowId, this.uiLang, this.store.state.clientKey, this.context);
    this.store.setSession(s.id, s.resumeCode);
    return s.id;
  }

  async pushAnswers(retry = true) {
    const id = await this.ensureSession();
    try {
      await this.api.saveAnswers(id, this.store.state.answers, this.step === DONE ? null : this.step);
    } catch (e) {
      if (retry && e instanceof ApiError && (e.status === 404 || e.code === 'already_submitted')) {
        this.forgetSession();
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
        sessionId = await this.sendSubmit(answers);
      } catch (e) {
        // Offline: keep the answers here and send them when the connection returns.
        if (isUnreachable(e)) return this.queueSubmit();
        this.busy = false;
        this.submitError = this.submitFailedMessage(e);
        this.render();
        this.view.querySelector('.op-primary')?.focus();
        this.announce(this.submitError);
        return;
      }
    }
    this.finish(sessionId, clean);
  }

  /** What to say when sending failed. The answers stay, so "Send" can be pressed again. */
  submitFailedMessage(e) {
    return this.tr(e instanceof ApiError && e.code === 'job_not_saved' ? 'jobNotSaved' : 'submitFailed');
  }

  /** Submit to the API. Safe to repeat: "already submitted" counts as sent. */
  async sendSubmit(answers) {
    const sessionId = await this.ensureSession();
    try {
      await this.api.submit(sessionId, answers);
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'already_submitted')) throw e;
    }
    return sessionId;
  }

  finish(sessionId, clean, { focus = true } = {}) {
    const publicAnswers = Object.fromEntries(
      Object.entries(clean).filter(([id]) => !this.nav.question(id).private),
    );
    // "reuse" answers (name, phone) could prefill other flows, but are only kept
    // on this device if the learner says yes on the done screen.
    const keep = Object.fromEntries(
      this.flow.questions.filter((q) => q.reuse && !q.private && clean[q.id] !== undefined).map((q) => [`${this.flow.flowId}.${q.id}`, clean[q.id]]),
    );
    this.profileOffer = Object.keys(keep).length > 0 ? keep : null;
    this.profileKept = false;
    this.busy = false;
    this.queued = false;
    this.store.clear();
    this.done = true; // not persisted: a reload starts a fresh form
    this.render({ focus });
    this.autoSpeak(focus);
    const detail = { flowId: this.flow.flowId, sessionId, answers: publicAnswers };
    if (this.context) detail.context = { ...this.context };
    this.emit('openpath:complete', detail);
  }
}
