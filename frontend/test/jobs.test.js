import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jobFromEmployerAnswers, readJobs, textIn, validateJobPosting } from '../../shared/jobs.js';
import { benefitsFromTags, readBenefits, SUPPORT_TAGS } from '../../shared/support-tags.js';
import { resetPacks } from '../src/messages.js';
import { langFile } from './helpers.js';
import '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.resolve(here, '../public/jobs/jobs.json'), 'utf8'));
const employerFlow = JSON.parse(fs.readFileSync(path.resolve(here, '../public/questions/employer-accommodations.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.resolve(here, '../lang/en.json'), 'utf8'));

const $ = (el, sel) => el.shadowRoot.querySelector(sel);
const $$ = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];

describe('schema.org JobPosting data', () => {
  it('the sample has 6 valid Ethiopian jobs in English and Amharic', () => {
    const { jobs, rejected } = readJobs(sample);
    expect(rejected).toEqual([]);
    expect(jobs).toHaveLength(6);
    for (const job of jobs) {
      expect(textIn(job.title, 'en').lang).toBe('en');
      expect(textIn(job.title, 'am').lang).toBe('am');
      expect(textIn(job.description, 'am').text).toMatch(/\p{Script=Ethiopic}/u);
      expect(job.jobLocation.address.addressCountry).toBe('ET');
      expect(readBenefits(job.jobBenefits).other).toEqual([]); // every benefit is a support tag
    }
  });

  it('uses only schema.org JobPosting terms and checks the values', () => {
    const job = structuredClone(sample['@graph'][0]);
    expect(validateJobPosting(job)).toEqual([]);
    expect(validateJobPosting({ ...job, accommodations: ['x'] }).join()).toMatch(/"accommodations" is not a JobPosting property/);
    expect(validateJobPosting({ ...job, employmentType: 'SOMETIMES' }).join()).toMatch(/employmentType/);
    expect(validateJobPosting({ ...job, identifier: '../x' }).join()).toMatch(/identifier/);
    expect(validateJobPosting({ ...job, title: [{ '@value': '' }] }).join()).toMatch(/title/);
    expect(validateJobPosting({ ...job, url: 'javascript:alert(1)' }).join()).toMatch(/url/);
  });

  it('stores support as jobBenefits text, one value per shared tag', () => {
    const texts = benefitsFromTags(['remote-work', 'flexible-hours']);
    expect(texts).toEqual(['Flexible hours', 'Remote work possible']);
    expect(readBenefits([...texts, 'Free lunch'])).toEqual({ tags: ['flexible-hours', 'remote-work'], other: ['Free lunch'] });
    // The interface has a label for every tag, and the employer form offers exactly these tags.
    for (const tag of SUPPORT_TAGS) expect(en.strings[`support_${tag.id}`]).toBe(tag.text);
    const offered = employerFlow.questions.find((q) => q.id === 'accommodations').options;
    expect(offered.map((o) => [o.value, o.label.en])).toEqual(SUPPORT_TAGS.map((t) => [t.id, t.text]));
  });

  it('turns employer answers into a JobPosting', () => {
    const job = jobFromEmployerAnswers(
      { jobTitle: 'Cashier', organisation: 'Mercato Shop', location: 'Addis Ababa', employmentType: 'part-time', accommodations: ['remote-work', 'nope'] },
      { identifier: 'job-1', today: '2026-11-14' },
    );
    expect(validateJobPosting(job)).toEqual([]);
    expect(job).toMatchObject({ employmentType: 'PART_TIME', validThrough: '2027-01-13', jobBenefits: ['Remote work possible'], jobLocationType: 'TELECOMMUTE' });
  });
});

// ---- the element -------------------------------------------------------------------

let apiJobs;
function serve({ jobs = sample, api = false } = {}) {
  globalThis.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.endsWith('/jobs.json')) return { ok: true, status: 200, json: async () => structuredClone(jobs) };
    if (u.endsWith('/v1/jobs')) {
      if (!api) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => apiJobs };
    }
    const pack = langFile(u);
    if (pack) return pack;
    throw new Error(`unexpected fetch ${u}`);
  });
}

async function mountJobs(attrs = {}, opts = {}) {
  serve(opts);
  const el = document.createElement('openpath-jobs');
  el.setAttribute('src', '/jobs.json');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  await el.ready;
  return el;
}

beforeEach(() => {
  localStorage.clear();
  resetPacks();
  apiJobs = { '@context': 'https://schema.org', '@graph': [] };
});
afterEach(() => {
  document.body.textContent = '';
  vi.restoreAllMocks();
});

describe('<openpath-jobs>', () => {
  it('lists every open job: a heading per title and one clearly named Apply button', async () => {
    const el = await mountJobs();
    expect($(el, 'h2').textContent).toBe('Jobs');
    const titles = $$(el, '.op-job h3').map((h) => h.textContent);
    expect(titles).toHaveLength(6);
    expect(titles[0]).toBe('Virtual assistant intern'); // newest first
    for (const article of $$(el, '.op-job article')) {
      const buttons = article.querySelectorAll('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0].textContent).toBe(`Apply for ${article.querySelector('h3').textContent}`);
      expect(article.getAttribute('aria-labelledby')).toBe(article.querySelector('h3').id);
    }
    expect($(el, '.op-jobs-count').textContent).toBe('6 jobs');
    const first = $(el, '.op-job');
    expect(first.querySelector('.op-job-support').textContent).toContain('Remote work possible');
    expect(first.querySelector('dl').textContent).toContain('Internship');
  });

  it('writes the jobs into the host page as JSON-LD, and removes it when the list goes away', async () => {
    const el = await mountJobs();
    const script = document.head.querySelector('script[type="application/ld+json"][data-openpath-jobs]');
    const ld = JSON.parse(script.textContent);
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@graph']).toHaveLength(6);
    expect(ld['@graph'].every((j) => j['@type'] === 'JobPosting' && validateJobPosting(j).length === 0)).toBe(true);
    el.remove();
    expect(document.head.querySelector('script[data-openpath-jobs]')).toBeNull();
  });

  it('JSON-LD cannot be broken out of with </script> in job text', async () => {
    const jobs = structuredClone(sample);
    jobs['@graph'][0].description = '</script><script>alert(1)</script>';
    await mountJobs({}, { jobs });
    const script = document.head.querySelector('script[data-openpath-jobs]');
    expect(script.textContent).not.toContain('</script>');
    expect(JSON.parse(script.textContent)['@graph'].some((j) => j.description === '</script><script>alert(1)</script>')).toBe(true);
  });

  it('shows Amharic text and Ethiopian dates in Amharic', async () => {
    const el = await mountJobs({ lang: 'am' });
    expect($(el, '.op-root').getAttribute('lang')).toBe('am');
    expect($(el, '.op-job h3').textContent).toBe('የቨርቹዋል ረዳት ልምምድ');
    expect($(el, '.op-job h3').hasAttribute('lang')).toBe(false); // in the form's language
    expect($(el, '.op-job button').textContent).toBe('ለ«የቨርቹዋል ረዳት ልምምድ» ያመልክቱ');
    expect($(el, '.op-job dl').textContent).toContain('ዓ.ም.'); // 2026-11-12 in the Ethiopian calendar
  });

  it('leaves out jobs that are closed or invalid, and merges the API jobs (API wins)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const jobs = structuredClone(sample);
    jobs['@graph'][1].validThrough = '2020-01-01';
    jobs['@graph'][2].employmentType = 'SOMETIMES';
    apiJobs['@graph'] = [{ ...sample['@graph'][0], title: 'Senior data entry clerk' }];
    const el = await mountJobs({ api: 'http://api.test' }, { jobs, api: true });
    const titles = $$(el, '.op-job h3').map((h) => h.textContent);
    expect(titles).toHaveLength(4);
    expect(titles).toContain('Senior data entry clerk');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('when the API is down, the jobs from the file still show; when nothing loads it says so', async () => {
    const el = await mountJobs({ api: 'http://api.test' });
    expect($$(el, '.op-job')).toHaveLength(6);
    el.remove();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    serve();
    globalThis.fetch = vi.fn(async (u) => langFile(u) ?? { ok: false, status: 404, json: async () => ({}) });
    const broken = document.createElement('openpath-jobs');
    broken.setAttribute('src', '/missing.json');
    document.body.append(broken);
    await broken.ready;
    expect($(broken, '.op-error').textContent).toBe('The jobs could not be loaded. Please try again.');
    expect(warn).toHaveBeenCalled();
  });

  it('"Apply for ..." opens the application form for that job, and Back returns to it', async () => {
    const el = await mountJobs({ api: 'http://api.test', languages: 'en,am' });
    $(el, '.op-job button').click();
    const flow = $(el, 'openpath-flow');
    expect(flow.getAttribute('questions')).toBe('http://localhost:3000/questions/job-application.json');
    expect(flow.getAttribute('api')).toBe('http://api.test');
    expect(flow.context).toEqual({ jobId: 'sample-virtual-assistant-gondar', jobTitle: 'Virtual assistant intern', organisation: 'Gondar Remote Work Collective (sample)' });
    expect(el.shadowRoot.activeElement.textContent).toBe('Applying for Virtual assistant intern at Gondar Remote Work Collective (sample)');
    $(el, '.op-back-to-jobs').click();
    await vi.waitFor(() => expect(el.shadowRoot.activeElement?.dataset.job).toBe('sample-virtual-assistant-gondar'));
  });
});
