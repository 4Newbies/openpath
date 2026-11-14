// The JSON Schema and the shared validator must agree.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { validateFlow } from '../../shared/flow.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.resolve(here, p), 'utf8'));
const schema = read('../../shared/questions.schema.json');
const onboarding = read('../../frontend/public/questions/onboarding.json');
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

describe('questions.schema.json', () => {
  it('accepts the default onboarding file', () => {
    expect(validate(onboarding), JSON.stringify(validate.errors)).toBe(true);
    expect(validateFlow(onboarding)).toEqual([]);
  });

  const broken = {
    'missing title': (f) => delete f.title,
    'unknown type': (f) => (f.questions[2].type = 'slider'),
    'choice without options': (f) => delete f.questions[5].options,
    'text with options': (f) => (f.questions[2].options = [{ value: 'a', label: { en: 'A' } }]),
    'unsupported language': (f) => (f.title.fr = 'Rejoindre'),
    'unknown question field': (f) => (f.questions[2].colour = 'red'),
    'required info screen': (f) => (f.questions[0].required = true),
  };
  for (const [name, breakIt] of Object.entries(broken)) {
    it(`schema and validator both reject: ${name}`, () => {
      const f = structuredClone(onboarding);
      breakIt(f);
      expect(validate(f)).toBe(false);
      expect(validateFlow(f).length).toBeGreaterThan(0);
    });
  }
});
