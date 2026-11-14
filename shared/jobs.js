// Jobs as schema.org/JobPosting. Used by <openpath-jobs> and the API.
// Plain ES module, no dependencies.
//
// Only schema.org terms are used:
//   identifier, title, description, hiringOrganization (Organization),
//   jobLocation (Place > PostalAddress), jobLocationType ("TELECOMMUTE"),
//   applicantLocationRequirements (Country), employmentType, datePosted,
//   validThrough, jobBenefits, url, directApply.
// Text in several languages uses JSON-LD language-tagged values:
//   "title": [{ "@value": "Data entry clerk", "@language": "en" },
//             { "@value": "የመረጃ መዝጋቢ", "@language": "am" }]
// Accommodations are jobBenefits text values, one per support tag, using the
// tag's English text from support-tags.js.

import { benefitsFromTags, isSupportTag } from './support-tags.js';

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'INTERN', 'VOLUNTEER', 'PER_DIEM', 'OTHER'];

const JOB_KEYS = new Set([
  '@context', '@type', '@id', 'identifier', 'title', 'description', 'hiringOrganization', 'jobLocation',
  'jobLocationType', 'applicantLocationRequirements', 'employmentType', 'datePosted', 'validThrough',
  'jobBenefits', 'url', 'directApply',
]);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const MAX_TEXT = 2000;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Text in the wanted language from a string or language-tagged values: { text, lang }. */
export function textIn(value, lang) {
  if (typeof value === 'string') return { text: value, lang: null };
  const list = [].concat(value ?? []).filter((v) => isObj(v) && typeof v['@value'] === 'string');
  const found = list.find((v) => v['@language'] === lang) ?? list.find((v) => v['@language'] === 'en') ?? list[0];
  return found ? { text: found['@value'], lang: found['@language'] ?? null } : { text: '', lang: null };
}

function checkText(value, path, errors, { required = false } = {}) {
  if (value === undefined) {
    if (required) errors.push(`${path} is missing`);
    return;
  }
  const values = typeof value === 'string' ? [{ '@value': value }] : [].concat(value);
  if (!values.length) errors.push(`${path} is empty`);
  for (const v of values) {
    if (!isObj(v) || typeof v['@value'] !== 'string' || !v['@value'].trim()) {
      errors.push(`${path} must be text or [{ "@value": "...", "@language": "en" }]`);
      return;
    }
    if (v['@value'].length > MAX_TEXT) errors.push(`${path} is too long`);
    if (v['@language'] !== undefined && !LANG_RE.test(v['@language'])) errors.push(`${path} has a bad @language`);
    for (const k of Object.keys(v)) if (k !== '@value' && k !== '@language') errors.push(`${path} has unknown key "${k}"`);
  }
}

/** Problems with one JobPosting; an empty list means it is usable. */
export function validateJobPosting(job) {
  const errors = [];
  if (!isObj(job)) return ['a job must be an object'];
  if (job['@type'] !== 'JobPosting') errors.push('@type must be "JobPosting"');
  for (const k of Object.keys(job)) if (!JOB_KEYS.has(k)) errors.push(`"${k}" is not a JobPosting property used by OpenPath`);
  if (typeof job.identifier !== 'string' || !ID_RE.test(job.identifier)) errors.push('identifier must be 1 to 64 letters, digits, - or _');
  checkText(job.title, 'title', errors, { required: true });
  checkText(job.description, 'description', errors, { required: true });
  const org = job.hiringOrganization;
  if (!isObj(org) || org['@type'] !== 'Organization') errors.push('hiringOrganization must be { "@type": "Organization", "name": ... }');
  else checkText(org.name, 'hiringOrganization.name', errors, { required: true });
  const remote = job.jobLocationType === 'TELECOMMUTE';
  if (job.jobLocationType !== undefined && !remote) errors.push('jobLocationType can only be "TELECOMMUTE"');
  if (job.jobLocation !== undefined || !remote) {
    const place = job.jobLocation;
    const address = place?.address;
    if (!isObj(place) || place['@type'] !== 'Place' || !isObj(address) || address['@type'] !== 'PostalAddress') {
      errors.push('jobLocation must be { "@type": "Place", "address": { "@type": "PostalAddress", ... } }');
    } else {
      checkText(address.addressLocality, 'jobLocation.address.addressLocality', errors, { required: true });
      checkText(address.addressRegion, 'jobLocation.address.addressRegion', errors);
      if (address.addressCountry !== undefined && !/^[A-Z]{2}$/.test(address.addressCountry)) errors.push('addressCountry must be a two-letter code such as "ET"');
    }
  }
  const types = [].concat(job.employmentType ?? []);
  if (!types.length || types.some((t) => !EMPLOYMENT_TYPES.includes(t))) errors.push(`employmentType must be one or more of ${EMPLOYMENT_TYPES.join(', ')}`);
  if (typeof job.datePosted !== 'string' || !DATE_RE.test(job.datePosted)) errors.push('datePosted must be a date (YYYY-MM-DD)');
  if (job.validThrough !== undefined && (typeof job.validThrough !== 'string' || !DATE_RE.test(job.validThrough))) errors.push('validThrough must be a date');
  if (job.jobBenefits !== undefined) {
    const list = [].concat(job.jobBenefits);
    if (list.length > 30 || list.some((b) => typeof b !== 'string' || !b.trim() || b.length > 300)) errors.push('jobBenefits must be a list of short texts');
  }
  if (job.url !== undefined && !(typeof job.url === 'string' && /^https?:\/\/\S+$/.test(job.url))) errors.push('url must be an http(s) URL');
  if (job.directApply !== undefined && typeof job.directApply !== 'boolean') errors.push('directApply must be true or false');
  return errors;
}

/**
 * Jobs from a JSON document: a list, a single JobPosting, or JSON-LD with
 * "@graph". Returns { jobs, rejected: [{ job, errors }] }.
 */
export function readJobs(data) {
  const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data['@graph']) ? data['@graph'] : isObj(data) ? [data] : [];
  const jobs = [];
  const rejected = [];
  for (const job of list) {
    const errors = validateJobPosting(job);
    if (errors.length) rejected.push({ job, errors });
    else {
      const { '@context': _ctx, ...rest } = job;
      jobs.push(rest);
    }
  }
  return { jobs, rejected };
}

/** Is the job still open on this day ("YYYY-MM-DD")? */
export const isOpen = (job, today) => !job.validThrough || job.validThrough.slice(0, 10) >= today;

/** The jobs as one JSON-LD document. */
export const jobsJsonLd = (jobs) => ({ '@context': 'https://schema.org', '@graph': jobs.map((j) => ({ '@type': 'JobPosting', ...j })) });

// Employer form answers (employer-accommodations.json) -> JobPosting.
const EMPLOYMENT_FROM_ANSWER = {
  'full-time': 'FULL_TIME',
  'part-time': 'PART_TIME',
  contract: 'CONTRACTOR',
  temporary: 'TEMPORARY',
  internship: 'INTERN',
};

export function jobFromEmployerAnswers(answers, { identifier, today, lang, validDays = 60 }) {
  const tags = [].concat(answers.accommodations ?? []).filter(isSupportTag);
  const tagged = (text) => (lang && lang !== 'en' ? [{ '@value': text, '@language': lang }] : text);
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + validDays);
  const job = {
    '@type': 'JobPosting',
    identifier,
    title: tagged(answers.jobTitle),
    description: tagged(answers.description || answers.jobTitle),
    hiringOrganization: { '@type': 'Organization', name: answers.organisation },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: answers.location, addressCountry: 'ET' } },
    employmentType: EMPLOYMENT_FROM_ANSWER[answers.employmentType] ?? 'OTHER',
    datePosted: today,
    validThrough: end.toISOString().slice(0, 10),
    directApply: true,
  };
  if (tags.length) job.jobBenefits = benefitsFromTags(tags);
  if (tags.includes('remote-work')) {
    job.jobLocationType = 'TELECOMMUTE';
    job.applicantLocationRequirements = { '@type': 'Country', name: 'ET' };
  }
  return job;
}
