import { validateAnswer, validateAnswers } from '../../shared/flow.js';
import { ApiError, createApi } from './api.js';
import { h } from './dom.js';
import { loadFlow } from './loader.js';
import { errorMessage, pick, t } from './messages.js';
import { createNavigator, REVIEW } from './navigator.js';
import { renderReview } from './review.js';
import { renderStep } from './steps/index.js';
import { createStore } from './store.js';
import css from './styles.css?inline';

let counter = 0;
const DONE = 'done';

/**
 * <openpath-flow questions="/questions/onboarding.json" api="http://localhost:4000" lang="en">
 *
 * Events (bubble and cross the shadow boundary):
 *   openpath:step      detail { flowId, stepId, index, total }
 *   openpath:complete  detail { flowId, sessionId, answers }  (private answers left out)
 */
export class OpenPathFlow extends HTMLElement {
  static get observedAttributes() {
    return ['lang'];
  }

  constructor() {
    super();
    this.uid = ++counter;
    this.error = null; // { questionId, message } for the current step
    this.submitError = null;
    this.busy = false;
    this.saveChain = Promise.resolve();
  }

  get uiLang() {
    return this.getAttribute('lang') === 'am' ? 'am' : 'en';
  }

  connectedCallback() {
    if (this.shadowRoot) return;
    const shadow = this.attachShadow({ mode: 'open' });
    this.live = h('div', { class: 'op-sr', 'aria-live': 'polite' });
    this.view = h('div', { class: 'op-card' }, h('p', { text: t(this.uiLang, 'loading') }));
    this.root = h('div', { class: 'op-root', lang: this.uiLang }, this.view, this.live);
    shadow.append(h('style', { text: css }), this.root);
    this.ready = this.start();
  }

  attributeChangedCallback(name) {
    if (name === 'lang' && this.root) {
      this.root.setAttribute('lang', this.uiLang);
      if (this.flow) this.render();
    }
  }

  async start() {
    const { flow } = await loadFlow(this.getAttribute('questions'));
    this.flow = flow;
    this.store = createStore(flow);
    this.nav = createNavigator(flow);
    const api = this.getAttribute('api');
    this.api = api ? createApi(api) : null;
    this.store.subscribe(() => this.applyPreferences());
    this.applyPreferences();

    if (this.api && this.store.state.sessionId) await this.checkSession();
    const step = this.nav.resolve(this.store.state.step, this.store.state.answers);
    this.go(step, { focus: false });
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

  applyPreferences() {
    const access = this.store?.state.preferences.access ?? [];
    this.root.toggleAttribute('data-larger-text', access.includes('larger-text'));
    this.root.toggleAttribute('data-high-contrast', access.includes('high-contrast'));
  }

  announce(text) {
    // Clear first so the same message is announced again.
    this.live.textContent = '';
    setTimeout(() => {
      this.live.textContent = text;
    }, 50);
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  get step() {
    return this.done ? DONE : this.store.state.step;
  }

  go(step, { focus = true, returnToReview } = {}) {
    if (step !== this.step || returnToReview !== undefined) this.store.setStep(step, returnToReview === undefined ? {} : { returnToReview });
    if (step !== REVIEW) this.submitError = null;
    this.render({ focus });
    const { index, total } = step === REVIEW ? { index: 0, total: this.nav.position(step, this.store.state.answers).total } : this.nav.position(step, this.store.state.answers);
    this.emit('openpath:step', { flowId: this.flow.flowId, stepId: step, index, total });
  }

  render({ focus = false, focusField = false } = {}) {
    const lang = this.uiLang;
    const { answers } = this.store.state;
    this.view.textContent = '';
    const title = pick(this.flow.title, lang);
    this.view.append(h('p', { class: 'op-title', lang: title.lang !== lang ? title.lang : undefined, text: title.text }));

    if (this.step === DONE) return this.renderDone(focus);
    if (this.step === REVIEW) {
      const review = renderReview({
        flow: this.flow,
        answers,
        lang,
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
      error,
      uid: this.uid,
      onChange: (value) => {
        this.store.setAnswer(q.id, value);
        // A showIf answer can change the number of steps: update the text in
        // place (no re-render, so focus stays where it is).
        const pos = this.nav.position(q.id, this.store.state.answers);
        const progress = this.view.querySelector('.op-progress');
        if (progress) progress.textContent = t(lang, 'stepOf', { n: pos.index, total: pos.total });
      },
    });

    const back = this.nav.back(q.id, answers);
    const form = h(
      'form',
      { class: 'op-form', novalidate: true, onsubmit: (e) => (e.preventDefault(), this.next()) },
      step.node,
      h(
        'div',
        { class: 'op-nav' },
        back ? h('button', { type: 'button', class: 'op-button op-secondary', onclick: () => this.back(), text: t(lang, 'back') }) : null,
        !q.required && q.type !== 'info'
          ? h('button', { type: 'button', class: 'op-button op-secondary', onclick: () => this.skip(), text: t(lang, 'skip') })
          : null,
        h('button', { type: 'submit', class: 'op-button op-primary', text: t(lang, 'next') }),
      ),
    );
    this.view.append(h('p', { class: 'op-progress', text: t(lang, 'stepOf', { n: index, total }) }), form);
    if (focusField) step.focusField();
    else if (focus) this.view.querySelector('.op-question')?.focus();
  }

  renderDone(focus) {
    const heading = h('h2', { class: 'op-question', tabindex: '-1', text: t(this.uiLang, 'doneTitle') });
    this.view.append(h('div', { class: 'op-step' }, heading, h('p', { class: 'op-body', text: t(this.uiLang, 'doneBody') })));
    if (focus) heading.focus();
  }

  next() {
    const q = this.nav.question(this.step);
    const { answers } = this.store.state;
    const code = validateAnswer(q, answers[q.id]);
    if (code) {
      const message = errorMessage(this.uiLang, q, code);
      this.error = { questionId: q.id, message };
      this.render({ focusField: true });
      this.announce(message);
      return;
    }
    this.error = null;
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
      if (announce) this.announce(t(this.uiLang, 'saved'));
      return this.saveChain;
    }
    this.saveChain = this.saveChain.then(async () => {
      try {
        await this.pushAnswers();
        if (announce) this.announce(t(this.uiLang, 'saved'));
      } catch {
        if (announce) this.announce(t(this.uiLang, 'savedLocal'));
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
      const message = errorMessage(this.uiLang, q, first.code);
      this.error = { questionId: q.id, message };
      this.store.setStep(q.id, { returnToReview: true });
      this.render({ focusField: true });
      this.announce(`${t(this.uiLang, 'fixBeforeSubmit')} ${message}`);
      return;
    }

    // Update the button in place so keyboard focus stays on it while sending.
    this.busy = true;
    const button = this.view.querySelector('.op-primary');
    if (button) {
      button.setAttribute('aria-disabled', 'true');
      button.textContent = t(this.uiLang, 'submitting');
    }
    this.announce(t(this.uiLang, 'submitting'));
    let sessionId = null;
    if (this.api) {
      try {
        await this.saveChain;
        sessionId = await this.ensureSession();
        await this.api.submit(sessionId, answers);
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'already_submitted')) {
          this.busy = false;
          this.submitError = t(this.uiLang, 'submitFailed');
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
    this.emit('openpath:complete', { flowId: this.flow.flowId, sessionId, answers: publicAnswers });
  }
}
