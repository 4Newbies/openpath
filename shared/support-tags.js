// The shared list of support (workplace accommodations) an employer can
// offer, used by the employer form, the job list and the private
// "Support I need" filter. Plain ES module, no dependencies.
//
// In JobPosting data a tag is stored as one schema.org `jobBenefits` text
// value: the tag's English `text` below, exactly. OpenPath maps it back to
// the tag and shows it in the learner's language (lang/*.json, key
// support_<id>). Any other jobBenefits text is shown as written.
//
// The ids are also the option values in employer-accommodations.json.

export const SUPPORT_TAGS = [
  { id: 'screen-reader-application', text: 'Screen-reader-friendly application' },
  { id: 'sign-language-interview', text: 'Sign language interpreter at interview' },
  { id: 'step-free-workplace', text: 'Step-free workplace' },
  { id: 'flexible-hours', text: 'Flexible hours' },
  { id: 'remote-work', text: 'Remote work possible' },
  { id: 'written-instructions', text: 'Written instructions' },
  { id: 'extra-time-assessments', text: 'Extra time in assessments' },
];

const byId = new Map(SUPPORT_TAGS.map((t) => [t.id, t]));
const byText = new Map(SUPPORT_TAGS.map((t) => [t.text.toLowerCase(), t]));

export const isSupportTag = (id) => byId.has(id);

/** jobBenefits text values -> { tags: [ids], other: [texts that are not tags] }. */
export function readBenefits(jobBenefits) {
  const list = jobBenefits === undefined ? [] : [].concat(jobBenefits);
  const tags = [];
  const other = [];
  for (const v of list) {
    if (typeof v !== 'string') continue;
    const tag = byText.get(v.trim().toLowerCase());
    if (tag) {
      if (!tags.includes(tag.id)) tags.push(tag.id);
    } else if (v.trim()) other.push(v.trim());
  }
  return { tags, other };
}

/** Tag ids -> jobBenefits text values (in the order of SUPPORT_TAGS). */
export function benefitsFromTags(ids) {
  return SUPPORT_TAGS.filter((t) => ids.includes(t.id)).map((t) => t.text);
}
