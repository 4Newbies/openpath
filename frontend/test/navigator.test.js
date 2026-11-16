import { describe, expect, it } from 'vitest';
import { isVisible } from '../../shared/flow.js';
import { createNavigator, REVIEW } from '../src/navigator.js';

const flow = {
  version: '1',
  flowId: 'nav',
  title: { en: 'Nav' },
  questions: [
    { id: 'a', type: 'info', label: { en: 'A' } },
    { id: 'kind', type: 'single', label: { en: 'Kind' }, options: [{ value: 'x', label: { en: 'X' } }, { value: 'y', label: { en: 'Y' } }] },
    { id: 'onlyX', type: 'text', label: { en: 'Only X' }, showIf: { id: 'kind', equals: 'x' } },
    { id: 'nested', type: 'yesno', label: { en: 'Nested' }, showIf: { id: 'onlyX', equals: 'yes' } },
    { id: 'tags', type: 'multi', label: { en: 'Tags' }, options: [{ value: 't1', label: { en: 'T1' } }] },
    { id: 'ifTag', type: 'text', label: { en: 'If tag' }, showIf: { id: 'tags', equals: 't1' } },
    { id: 'last', type: 'text', label: { en: 'Last' } },
  ],
};
const nav = createNavigator(flow);

describe('showIf', () => {
  const byId = (id) => flow.questions.find((q) => q.id === id);

  it('shows a question only when the earlier answer matches', () => {
    expect(isVisible(byId('onlyX'), {}, flow)).toBe(false);
    expect(isVisible(byId('onlyX'), { kind: 'y' }, flow)).toBe(false);
    expect(isVisible(byId('onlyX'), { kind: 'x' }, flow)).toBe(true);
  });

  it('matches multi answers that include the value', () => {
    expect(isVisible(byId('ifTag'), { tags: ['t1'] }, flow)).toBe(true);
    expect(isVisible(byId('ifTag'), { tags: [] }, flow)).toBe(false);
  });

  it('hides a question whose parent is hidden, even if a stale answer matches', () => {
    expect(isVisible(byId('nested'), { kind: 'x', onlyX: 'yes' }, flow)).toBe(true);
    expect(isVisible(byId('nested'), { kind: 'y', onlyX: 'yes' }, flow)).toBe(false);
  });
});

describe('Next and Back', () => {
  it('skips hidden questions going forward', () => {
    expect(nav.first({})).toBe('a');
    expect(nav.next('a', {})).toBe('kind');
    expect(nav.next('kind', { kind: 'y' })).toBe('tags');
    expect(nav.next('kind', { kind: 'x' })).toBe('onlyX');
    expect(nav.next('tags', { tags: ['t1'] })).toBe('ifTag');
    expect(nav.next('last', {})).toBe(REVIEW);
  });

  it('skips hidden questions going back, and Back from review is the last visible question', () => {
    expect(nav.back('tags', { kind: 'y' })).toBe('kind');
    expect(nav.back('tags', { kind: 'x', onlyX: 'yes' })).toBe('nested');
    expect(nav.back(REVIEW, {})).toBe('last');
    expect(nav.back('a', {})).toBeNull();
  });

  it('counts only visible questions in "Step n of m"', () => {
    expect(nav.position('kind', {})).toEqual({ index: 2, total: 4 });
    expect(nav.position('tags', { kind: 'x', tags: ['t1'] })).toEqual({ index: 4, total: 6 });
  });

  it('moves a saved step that is now hidden to the next visible one', () => {
    expect(nav.resolve('onlyX', { kind: 'y' })).toBe('tags');
    expect(nav.resolve('missing', {})).toBe('a');
    expect(nav.resolve(null, {})).toBe('a');
    expect(nav.resolve(REVIEW, {})).toBe(REVIEW);
  });
});
