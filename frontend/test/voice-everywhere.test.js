import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPacks } from '../src/messages.js';
import { resetProviders, setVoiceProvider } from '../src/providers.js';
import { foldEthiopic, matchDatePart, westernDigits } from '../src/voice.js';
import { $, $$, mount, wait } from './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pack = (code) => JSON.parse(fs.readFileSync(path.resolve(here, `../lang/${code}.json`), 'utf8')).strings;
const en = pack('en');
const am = pack('am');
const months = (lists) => Array.from({ length: 13 }, (_, i) => lists.map((l) => l[i]));
const ethMonths = months([en.ethiopianMonths, am.ethiopianMonths]);

describe('matching a spoken day, month or year', () => {
  it('months by name, in English and Amharic, whatever the Amharic spelling', () => {
    expect(matchDatePart('Hidar', { min: 1, max: 13, months: ethMonths })).toBe(3);
    expect(matchDatePart('ኅዳር', { min: 1, max: 13, months: ethMonths })).toBe(3);
    expect(matchDatePart('ህዳር', { min: 1, max: 13, months: ethMonths })).toBe(3); // same sound, other letter
    expect(matchDatePart('ሐምሌ', { min: 1, max: 13, months: ethMonths })).toBe(11);
    expect(matchDatePart('in pagume', { min: 1, max: 13, months: ethMonths })).toBe(13);
    expect(matchDatePart('3', { min: 1, max: 13, months: ethMonths })).toBe(3);
    expect(matchDatePart('banana', { min: 1, max: 13, months: ethMonths })).toBeUndefined();
  });

  it('days as digits or words, the longest word winning', () => {
    expect(matchDatePart('five', { min: 1, max: 30, numberWords: en.voiceNumbers })).toBe(5);
    expect(matchDatePart('twenty-one', { min: 1, max: 30, numberWords: en.voiceNumbers })).toBe(21);
    expect(matchDatePart('the 5th', { min: 1, max: 30 })).toBe(5);
    expect(matchDatePart('አምስት', { min: 1, max: 30, numberWords: am.voiceNumbers })).toBe(5);
    expect(matchDatePart('ሃያ አምስት', { min: 1, max: 30, numberWords: am.voiceNumbers })).toBe(25);
    expect(matchDatePart('፳፭', { min: 1, max: 30 })).toBe(25);
    expect(matchDatePart('٥', { min: 1, max: 30 })).toBe(5);
    expect(matchDatePart('thirty one', { min: 1, max: 30, numberWords: en.voiceNumbers })).toBe(30); // "thirty" fits, "thirty one" doesn't
    expect(matchDatePart('45', { min: 1, max: 30 })).toBeUndefined();
  });

  it('years as digits, within the list', () => {
    expect(matchDatePart('1993', { min: 1892, max: 2019 })).toBe(1993);
    expect(matchDatePart('born in ١٩٩٣', { min: 1892, max: 2019 })).toBe(1993);
    expect(matchDatePart('2025', { min: 1892, max: 2019 })).toBeUndefined();
  });

  it('folds Amharic letters that sound the same, and reads other digits', () => {
    expect(foldEthiopic('ኅዳር ሠላሳ ዐሥር ፀሐይ')).toBe(foldEthiopic('ህዳር ሰላሳ አስር ጸሀይ'));
    expect(westernDigits('٢٠٢٦ ۱۹ ፲፭').trim().replace(/\s+/g, ' ')).toBe('2026 19 15');
  });
});

// ---- in the form -----------------------------------------------------------------

const flow = {
  version: '1',
  flowId: 'voice-all',
  title: { en: 'Voice' },
  questions: [
    { id: 'intro', type: 'info', label: { en: 'Hello' } },
    { id: 'name', type: 'text', label: { en: 'Name' } },
    { id: 'phone', type: 'phone', label: { en: 'Phone' } },
    { id: 'dob', type: 'date', calendar: 'ethiopian', label: { en: 'Born' } },
    { id: 'when', type: 'date', label: { en: 'When (Gregorian)' } },
    { id: 'lang', type: 'single', label: { en: 'Language' }, options: [{ value: 'en', label: { en: 'English' } }, { value: 'am', label: { en: 'Amharic' } }] },
    { id: 'hours', type: 'multi', label: { en: 'Hours' }, options: [{ value: 'day', label: { en: 'Day' } }, { value: 'night', label: { en: 'Night' } }] },
    { id: 'ok', type: 'yesno', label: { en: 'OK?' } },
    { id: 'support', type: 'text', multiline: true, private: true, label: { en: 'Private support' } },
    { id: 'typed', type: 'text', voice: false, label: { en: 'Typing only' } },
  ],
};

let said;
beforeEach(() => {
  localStorage.clear();
  resetPacks();
  said = [];
  setVoiceProvider({ isAvailable: () => true, listen: async () => said.shift() ?? '', stop() {} });
});
afterEach(() => {
  resetProviders();
  document.body.textContent = '';
  vi.restoreAllMocks();
});

const voiceOn = { chosen: true, voice: true, voiceConsent: 'allow' };
async function at(id, lang = 'en') {
  const el = await mount(flow, { lang }, { prefs: voiceOn });
  el.go(id);
  return el;
}
async function speak(el, button, words) {
  said.push(words);
  button.click();
  await vi.waitFor(() => expect(el.listening).toBeFalsy());
  await wait(10);
}

describe('voice on every question', () => {
  it('every question that takes an answer has a mic by default; info and voice: false do not', async () => {
    const counts = {};
    for (const q of flow.questions) {
      const el = await at(q.id);
      counts[q.id] = $$(el, '.op-mic').length;
      el.remove();
    }
    expect(counts).toEqual({ intro: 0, name: 1, phone: 1, dob: 3, when: 3, lang: 1, hours: 1, ok: 1, support: 1, typed: 0 });
  });

  it('long text: each time the learner speaks, it is added to what is already there', async () => {
    const el = await at('support');
    const box = $(el, 'textarea');
    box.value = 'I use a wheelchair.';
    box.dispatchEvent(new Event('input'));
    await speak(el, $(el, '.op-mic'), 'A ground floor room would help.');
    await speak(el, $(el, '.op-mic'), 'Thank you');
    expect(box.value).toBe('I use a wheelchair. A ground floor room would help. Thank you');
    expect(el.store.state.answers.support).toBe(box.value);
    expect($(el, '.op-voice-status').textContent).toBe('Added: Thank you. Say more, edit it, or press Next.');
  });

  it('on a private question, says next to the mic that people nearby may hear', async () => {
    const el = await at('support');
    const note = $(el, '.op-voice-privacy');
    expect(note.textContent).toBe('People near you may hear what you say.');
    expect($(el, '.op-mic').getAttribute('aria-describedby')).toBe(note.id);
    el.remove();
    expect($(await at('name'), '.op-voice-privacy')).toBeNull();
  });

  it('date (Ethiopian): each list has its own mic and takes a spoken day, month name or year', async () => {
    const el = await at('dob');
    const mics = $$(el, '.op-mic');
    expect(mics.map((m) => m.textContent)).toEqual(['Say the day', 'Say the month', 'Say the year']);
    await speak(el, mics[0], 'five');
    await speak(el, $(el, '.op-mic[data-part=month]'), 'Hidar');
    await speak(el, $(el, '.op-mic[data-part=year]'), '1993');
    expect([$(el, 'select.op-date-day').value, $(el, 'select.op-date-month').value, $(el, 'select.op-date-year').value]).toEqual(['5', '3', '1993']);
    expect(el.store.state.answers.dob).toEqual({ date: ethIso(1993, 3, 5), calendar: 'ethiopian', ethiopian: { year: 1993, month: 3, day: 5 } });
    expect(el.shadowRoot.activeElement).toBe($(el, 'select.op-date-year'));
    expect($(el, '.op-voice-status').textContent).toBe('You said: 1993. Chosen: 1993. Change it or press Next.');
  });

  it('date in Amharic: Amharic month names and numbers', async () => {
    const el = await at('dob', 'am');
    await speak(el, $(el, '.op-mic[data-part=month]'), 'ህዳር');
    await speak(el, $(el, '.op-mic[data-part=day]'), 'ሃያ አምስት');
    expect([$(el, 'select.op-date-day').value, $(el, 'select.op-date-month').value]).toEqual(['25', '3']);
    expect($(el, '.op-mic[data-part=day]').textContent).toBe('ቀኑን ይናገሩ');
  });

  it('date (Gregorian boxes) too, and an unknown word chooses nothing', async () => {
    const el = await at('when');
    await speak(el, $(el, '.op-mic[data-part=month]'), 'March');
    expect($(el, 'input.op-date-month').value).toBe('3');
    await speak(el, $(el, '.op-mic[data-part=day]'), 'banana');
    expect($(el, 'input.op-date-day').value).toBe('');
    expect($(el, '.op-voice-status').textContent).toMatch(/does not match/);
  });
});

function ethIso(y, m, d) {
  // 5 Hidar 1993 E.C. = 14 November 2000
  return y === 1993 && m === 3 && d === 5 ? '2000-11-14' : null;
}
