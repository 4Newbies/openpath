import { isoToEthiopian } from '../../shared/ethiopian.js';
import { localToday } from '../../shared/flow.js';
import { isOpen, jobsJsonLd, readJobs, textIn } from '../../shared/jobs.js';
import { readBenefits, SUPPORT_TAGS } from '../../shared/support-tags.js';
import { createApi } from './api.js';
import { h, setText } from './dom.js';
import { folderUrl, resolveLanguages } from './language.js';
import { FALLBACK_LANG, langAttrs, packInfo, t, tList } from './messages.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { renderLanguageSwitcher } from './setup.js';
import css from './styles.css?inline';
import jobsCss from './jobs.css?inline';

let counter = 0;
export const FILTER_KEY = 'openpath:support-filter';
// Below this width the filter starts closed, so the jobs are not pushed off a phone screen.
const NARROW = '(max-width: 40em)';

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * <openpath-jobs src="/jobs/jobs.json" api="http://localhost:4000" lang="en"
 *                languages="en,am,ar" apply-flow="job-application">
 *
 * src:         jobs as schema.org/JobPosting JSON (a list, or JSON-LD with @graph).
 * api:         also lists the API's jobs (GET /v1/jobs) and saves applications there.
 * apply-flow:  the question file opened by "Apply" (default job-application),
 *              from flows-path (default: the "questions" folder next to openpath.js).
 * heading-level: level of the "Jobs" heading (default 2); job titles are one below.
 *
 * The jobs are also written into the host page as JSON-LD, so search engines
 * and other platforms can read them.
 *
 * The "Support I need" filter runs only in this browser: it is never sent to
 * a server, put in the URL or included in an event, and it is only stored
 * when the learner ticks "Remember on this device". It sits in a native
 * <details>, closed on narrow screens, and its summary says how many are chosen.
 */
export class OpenPathJobs extends HTMLElement {
  static get observedAttributes() {
    return ['lang', 'languages'];
  }

  constructor() {
    super();
    this.uid = ++counter;
    this.jobs = [];
    this.need = new Set(); // support the learner needs (private)
    this.remember = false;
  }

  get uiLang() {
    return this.activeLang ?? FALLBACK_LANG;
  }

  tr(key, vars) {
    return t(this.uiLang, key, vars, Boolean(this.prefs?.simple));
  }

  get level() {
    const n = Number(this.getAttribute('heading-level'));
    return n >= 1 && n <= 5 ? n : 2;
  }

  connectedCallback() {
    if (this.shadowRoot) return;
    const shadow = this.attachShadow({ mode: 'open' });
    this.live = h('div', { class: 'op-sr', 'aria-live': 'polite' });
    this.view = h('div', { class: 'op-card op-jobs' }, h('p', { text: this.tr('jobsLoading') }));
    this.root = h('div', { class: 'op-root', lang: FALLBACK_LANG, dir: 'ltr' }, this.view, this.live);
    shadow.append(h('style', { text: css + jobsCss }), this.root);
    this.ready = this.start();
  }

  disconnectedCallback() {
    this.ld?.remove();
    this.ld = null;
  }

  attributeChangedCallback(name, oldValue, value) {
    if (!this.loaded || oldValue === value) return;
    this.useLanguage().then(() => this.render());
  }

  async start() {
    this.prefs = loadPrefs();
    this.readSavedFilter();
    await this.useLanguage();
    await this.load();
  }

  /**
   * The learner picked a language in the list's own switcher. It is saved like
   * the form's choice, so "Apply" and other OpenPath forms on this site follow it.
   */
  async switchLanguage(code) {
    savePrefs({ ...loadPrefs(), lang: code });
    await this.useLanguage();
    this.render();
    // Focus stays on the language just chosen (now pressed).
    this.view.querySelector(`.op-lang [data-lang="${code}"]`)?.focus();
  }

  /** Follow the learner's helpers and language from "How do you want to use this?". */
  async useLanguage() {
    this.prefs = loadPrefs();
    this.root.toggleAttribute('data-larger-text', Boolean(this.prefs.largerText));
    this.root.toggleAttribute('data-high-contrast', Boolean(this.prefs.highContrast));
    this.root.toggleAttribute('data-simple', Boolean(this.prefs.simple));
    const { lang, switcher } = await resolveLanguages(this, this.prefs);
    this.activeLang = lang;
    this.switcherLangs = switcher;
    this.root.setAttribute('lang', lang);
    this.root.setAttribute('dir', packInfo(lang).dir);
  }

  // ---- data ------------------------------------------------------------------------

  async load() {
    this.view.textContent = '';
    this.view.append(h('p', { text: this.tr('jobsLoading') }));
    const src = this.getAttribute('src');
    const api = this.getAttribute('api');
    const fromFile = src
      ? fetch(src, { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then((r) => {
          if (!r.ok) throw new Error(`the server answered ${r.status}`);
          return r.json();
        })
      : Promise.resolve(null);
    const fromApi = api ? createApi(api).listJobs() : Promise.resolve(null);
    const [file, server] = await Promise.allSettled([fromFile, fromApi]);
    if ((!src || file.status === 'rejected') && (!api || server.status === 'rejected')) {
      if (file.status === 'rejected') console.warn(`[openpath] Could not load jobs from "${src}" (${file.reason?.message}).`);
      return this.renderFailed();
    }
    // The API's version of a job wins over the file's (same identifier).
    const byId = new Map();
    for (const result of [file, server]) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { jobs, rejected } = readJobs(result.value);
      for (const r of rejected) console.warn(`[openpath] A job was left out: ${r.errors.join('; ')}`);
      for (const job of jobs) byId.set(job.identifier, job);
    }
    const today = localToday();
    this.jobs = [...byId.values()].filter((j) => isOpen(j, today)).sort((a, b) => b.datePosted.localeCompare(a.datePosted));
    this.writeJsonLd();
    this.loaded = true;
    this.render();
  }

  /** The jobs as JSON-LD in the host page (outside the shadow root), for search engines. */
  writeJsonLd() {
    if (!this.ld) {
      this.ld = document.createElement('script');
      this.ld.type = 'application/ld+json';
      this.ld.dataset.openpathJobs = String(this.uid);
      document.head.append(this.ld);
    }
    // "<" escaped so job text can never close the script element.
    this.ld.textContent = JSON.stringify(jobsJsonLd(this.jobs)).replace(/</g, '\\u003c');
  }

  // ---- the private "Support I need" filter -----------------------------------------

  readSavedFilter() {
    try {
      const saved = JSON.parse(storage()?.getItem(FILTER_KEY) ?? 'null');
      if (Array.isArray(saved)) {
        this.need = new Set(saved.filter((id) => SUPPORT_TAGS.some((t) => t.id === id)));
        this.remember = true;
      }
    } catch {
      /* ignore */
    }
  }

  saveFilter() {
    try {
      if (this.remember) storage()?.setItem(FILTER_KEY, JSON.stringify([...this.need]));
      else storage()?.removeItem(FILTER_KEY);
    } catch {
      /* blocked: the filter still works for this visit */
    }
  }

  visibleJobs() {
    if (!this.need.size) return this.jobs;
    return this.jobs.filter((job) => {
      const offered = readBenefits(job.jobBenefits).tags;
      return [...this.need].every((id) => offered.includes(id));
    });
  }

  countText() {
    const shown = this.visibleJobs().length;
    const total = this.jobs.length;
    if (!total) return this.tr('jobsCountNone');
    if (!this.need.size) return shown === 1 ? this.tr('jobsCountOne') : this.tr('jobsCount', { count: shown });
    if (!shown) return this.tr('jobsCountFilteredNone', { total });
    return shown === 1 ? this.tr('jobsCountFilteredOne', { total }) : this.tr('jobsCountFiltered', { count: shown, total });
  }

  /** "Chosen: 2" in the filter's summary, hidden when nothing is chosen. */
  updateFilterCount() {
    const count = this.view.querySelector('.op-jobs-filter-count');
    if (!count) return;
    count.hidden = this.need.size === 0;
    count.textContent = '';
    if (this.need.size) {
      // The comma is only heard, so the summary reads "Support I need, Chosen: 2".
      count.append(
        h('span', { class: 'op-sr', text: ', ' }),
        h('span', { class: 'op-jobs-filter-number', text: this.tr('supportFilterChosen', { count: this.need.size }) }),
      );
    }
  }

  filterChanged() {
    this.saveFilter();
    this.updateFilterCount();
    this.renderList();
    const text = this.countText();
    setText(this.view.querySelector('.op-jobs-count'), text);
    // Announce the new number of results (cleared first so a repeat is read again).
    this.live.textContent = '';
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => setText(this.live, text), 50);
  }

  renderFilter() {
    const legendId = `op-jobs-${this.uid}-need`;
    const privacyId = `${legendId}-privacy`;
    const boxes = SUPPORT_TAGS.map((tag) => {
      const id = `${legendId}-${tag.id}`;
      const input = h('input', {
        type: 'checkbox',
        id,
        value: tag.id,
        checked: this.need.has(tag.id),
        onchange: () => {
          if (input.checked) this.need.add(tag.id);
          else this.need.delete(tag.id);
          this.filterChanged();
        },
      });
      return h('div', { class: 'op-option' }, input, h('label', { for: id, text: this.tr(`support_${tag.id}`) }));
    });
    const rememberId = `${legendId}-remember`;
    const remember = h('input', {
      type: 'checkbox',
      id: rememberId,
      checked: this.remember,
      onchange: () => {
        this.remember = remember.checked;
        this.saveFilter();
      },
    });
    const fieldset = h(
      'fieldset',
      { class: 'op-group op-jobs-filter', 'aria-describedby': privacyId },
      // The summary shows these words; the legend still names the group for screen readers.
      h('legend', { class: 'op-sr', text: this.tr('supportFilterLegend') }),
      h('p', { id: privacyId, class: 'op-privacy' }, h('strong', { text: this.tr('supportFilterPrivacy') }), ' ', this.tr('supportFilterHint')),
      h('div', { class: 'op-options op-options-inline' }, boxes),
      h(
        'div',
        { class: 'op-jobs-filter-tools' },
        h('div', { class: 'op-option op-remember' }, remember, h('label', { for: rememberId, text: this.tr('rememberFilter') })),
        h('button', {
          type: 'button',
          class: 'op-button op-secondary op-small',
          text: this.tr('clearFilter'),
          onclick: () => {
            this.need.clear();
            for (const b of this.view.querySelectorAll('.op-jobs-filter .op-options input')) b.checked = false;
            this.filterChanged();
          },
        }),
      ),
    );
    const details = h(
      'details',
      { class: 'op-jobs-filter-box', ontoggle: () => (this.filterOpen = details.open) },
      h(
        'summary',
        { class: 'op-jobs-filter-summary' },
        h('span', { class: 'op-subheading', text: this.tr('supportFilterLegend') }),
        h('span', { class: 'op-jobs-filter-count', hidden: true }),
      ),
      fieldset,
    );
    // Open on wide screens, closed on phones; after that, as the learner left it.
    details.open = this.filterOpen ?? !globalThis.matchMedia?.(NARROW).matches;
    return details;
  }

  // ---- rendering ---------------------------------------------------------------------

  text(value) {
    const { text, lang } = textIn(value, this.uiLang);
    return { text, ...(lang ? langAttrs(lang, this.uiLang) : {}) };
  }

  formatDate(value) {
    const iso = value.slice(0, 10);
    const [y, m, d] = iso.split('-').map(Number);
    if (this.uiLang === 'am') {
      const e = isoToEthiopian(iso);
      if (e) return t('am', 'ethiopianDateFormat', { day: e.day, month: tList('am', 'ethiopianMonths')[e.month - 1], year: e.year });
    }
    return this.tr('dateFormat', { day: d, month: tList(this.uiLang, 'gregorianMonths')[m - 1] ?? m, year: y });
  }

  renderFailed() {
    this.view.textContent = '';
    this.view.append(
      h('p', { class: 'op-error', text: this.tr('jobsFailed') }),
      h('button', { type: 'button', class: 'op-button op-primary', text: this.tr('tryAgain'), onclick: () => this.load() }),
    );
  }

  render() {
    if (!this.loaded) return;
    this.view.textContent = '';
    const titleId = `op-jobs-${this.uid}-title`;
    this.listNode = h('ul', { class: 'op-jobs-list', 'aria-labelledby': titleId });
    this.view.append(
      h(`h${this.level}`, { id: titleId, class: 'op-jobs-heading', tabindex: '-1', text: this.tr('jobsTitle') }),
      renderLanguageSwitcher({ tr: (k, v) => this.tr(k, v), languages: this.switcherLangs, current: this.uiLang, onLanguage: (code) => this.switchLanguage(code) }),
      this.jobs.length ? this.renderFilter() : null,
      h('p', { class: 'op-jobs-count', text: this.countText() }),
      this.listNode,
    );
    this.updateFilterCount();
    this.renderList();
  }

  renderList() {
    this.listNode.textContent = '';
    for (const job of this.visibleJobs()) this.listNode.append(this.renderJob(job));
  }

  renderJob(job) {
    const headingId = `op-jobs-${this.uid}-${job.identifier}`;
    const title = this.text(job.title);
    const org = this.text(job.hiringOrganization.name);
    const address = job.jobLocation?.address;
    const place = address ? this.text(address.addressLocality) : null;
    const remote = job.jobLocationType === 'TELECOMMUTE';
    const { tags, other } = readBenefits(job.jobBenefits);
    const fact = (label, ...value) => [h('dt', { text: this.tr(label) }), h('dd', {}, ...value)];
    const support = [...tags.map((id) => this.tr(`support_${id}`)), ...other];
    const supportId = `${headingId}-support`;

    return h(
      'li',
      { class: 'op-job' },
      h(
        'article',
        { 'aria-labelledby': headingId },
        h(`h${this.level + 1}`, { id: headingId, class: 'op-job-title', ...title }),
        h(
          'dl',
          { class: 'op-job-facts' },
          fact('jobOrganisation', h('span', org)),
          place || remote
            ? fact('jobWhere', place ? h('span', place) : null, place && remote ? ' · ' : null, remote ? this.tr('jobRemote') : null)
            : null,
          fact('jobType', [].concat(job.employmentType).map((e) => this.tr(`employment_${e}`)).join(', ')),
          fact('jobPosted', this.formatDate(job.datePosted)),
          job.validThrough ? fact('jobApplyBy', this.formatDate(job.validThrough)) : null,
        ),
        h('p', { class: 'op-job-desc', ...this.text(job.description) }),
        h('p', { id: supportId, class: 'op-subheading', text: this.tr('supportOffered') }),
        support.length
          ? h('ul', { class: 'op-job-support', 'aria-labelledby': supportId }, support.map((s) => h('li', { text: s })))
          : h('p', { class: 'op-hint', text: this.tr('noSupportListed') }),
        h('button', {
          type: 'button',
          class: 'op-button op-primary op-apply',
          'data-job': job.identifier,
          text: this.tr('applyFor', { title: title.text }),
          onclick: () => this.openApplication(job),
        }),
      ),
    );
  }

  // ---- applying ----------------------------------------------------------------------

  /** "Apply": the application form for this job, with the same helpers. */
  openApplication(job) {
    this.applying = job;
    const title = this.text(job.title);
    const org = this.text(job.hiringOrganization.name);
    const flow = document.createElement('openpath-flow');
    flow.setAttribute('flow', this.getAttribute('apply-flow') || 'job-application');
    flow.setAttribute('flows-path', folderUrl(this, 'flows-path', 'questions/'));
    for (const a of ['api', 'languages', 'lang-path']) if (this.hasAttribute(a)) flow.setAttribute(a, this.getAttribute(a));
    flow.setAttribute('lang', this.uiLang);
    // Which job this application is for. The private filter is never passed on.
    flow.context = { jobId: job.identifier, jobTitle: title.text, organisation: org.text };
    const heading = h(`h${this.level}`, {
      class: 'op-jobs-heading',
      tabindex: '-1',
      text: this.tr('applyingFor', { title: title.text, organisation: org.text }),
    });
    this.view.textContent = '';
    this.view.append(
      h('button', { type: 'button', class: 'op-button op-secondary op-small op-back-to-jobs', text: this.tr('backToJobs'), onclick: () => this.closeApplication() }),
      heading,
      flow,
    );
    heading.focus();
  }

  async closeApplication() {
    const job = this.applying;
    this.applying = null;
    await this.useLanguage(); // the learner may have changed language or helpers in the form
    this.render();
    // Identifiers are letters, digits, - and _ only, so they are safe in a selector.
    (this.view.querySelector(`.op-apply[data-job="${job?.identifier ?? ''}"]`) ?? this.view.querySelector('.op-jobs-heading'))?.focus();
  }
}
