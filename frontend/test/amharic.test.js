import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildReview, REVIEW_FILE } from '../scripts/amharic-review.mjs';
import flow from '../public/questions/onboarding.json';
import am from '../lang/am.json';
import en from '../lang/en.json';

const css = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/styles.css'), 'utf8');

describe('Amharic content', () => {
  it('every question has Amharic for its question, simple words, hint and answers', () => {
    const missing = [];
    const check = (where, obj) => {
      for (const k of ['label', 'simple', 'hint']) if (obj[k] && !obj[k].am?.trim()) missing.push(`${where}.${k}`);
    };
    if (!flow.title.am) missing.push('title');
    for (const q of flow.questions) {
      check(q.id, q);
      for (const o of q.options ?? []) check(`${q.id}/${o.value}`, o);
    }
    expect(missing).toEqual([]);
  });

  it('every error message has Amharic, normal and simple words', () => {
    for (const code of Object.keys(en.strings.errors)) {
      expect(am.strings.errors[code], code).toMatch(/\p{Script=Ethiopic}/u);
      expect(t(am, 'simple', code) ?? am.strings.errors[code], code).toMatch(/\p{Script=Ethiopic}/u);
    }
  });

  it('docs/amharic-review.md is up to date (run npm run review:amharic)', () => {
    expect(fs.readFileSync(REVIEW_FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(buildReview());
  });

  it('the review file shows every Amharic string beside its English', () => {
    const review = buildReview();
    for (const q of flow.questions) for (const k of ['label', 'simple', 'hint']) if (q[k]) expect(review).toContain(`| ${q[k].en} | ${q[k].am} |`);
    expect(review).toContain(`| next | Next | ${am.strings.next} |`);
  });

  it('Ethiopic text uses fonts already on the device, with line height of at least 1.6', () => {
    const rule = /:lang\(am\)[^{]*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const fonts = /font-family:\s*([^;]+);/.exec(rule)?.[1] ?? '';
    for (const f of ['Noto Sans Ethiopic', 'Nyala', 'Kefa']) expect(fonts).toContain(f);
    expect(fonts).toMatch(/sans-serif\)?$/);
    expect(Number(/line-height:\s*([\d.]+)/.exec(rule)?.[1])).toBeGreaterThanOrEqual(1.6);
    expect(css).not.toMatch(/@font-face|@import|url\(/); // nothing is downloaded
  });
});

function t(pack, part, code) {
  return pack[part]?.errors?.[code];
}
