import { validateFlow } from '../../shared/flow.js';
import defaultFlow from '../public/questions/onboarding.json';

export { defaultFlow };

/**
 * Fetch and validate a question file. Any problem logs a clear console
 * error and falls back to the bundled default onboarding flow, so the
 * person filling in the form always gets a working form.
 */
export async function loadFlow(url, { fetchImpl = globalThis.fetch, log = console } = {}) {
  if (!url) return { flow: defaultFlow, source: 'default', errors: [] };
  let data;
  try {
    const res = await fetchImpl(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    data = await res.json();
  } catch (e) {
    log.error(
      `[openpath] Could not load the question file "${url}" (${e.message}). Showing the default onboarding questions instead.`,
    );
    return { flow: defaultFlow, source: 'default', errors: [e.message] };
  }
  const errors = validateFlow(data);
  if (errors.length) {
    log.error(
      `[openpath] The question file "${url}" is invalid, so the default onboarding questions are shown instead. Problems:\n  - ${errors.join('\n  - ')}`,
    );
    return { flow: defaultFlow, source: 'default', errors };
  }
  return { flow: data, source: url, errors: [] };
}
