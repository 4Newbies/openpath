import { validateFlow } from '../../shared/flow.js';
import defaultFlow from '../public/questions/onboarding.json';

export { defaultFlow };

/**
 * Fetch and validate a question file. Any problem logs a clear console
 * error and falls back to the bundled default onboarding flow, so the
 * person filling in the form always gets a working form.
 */
export async function loadFlow(url, { fetchImpl = globalThis.fetch, log = console, fallback = true } = {}) {
  if (!url) return { flow: defaultFlow, source: 'default', errors: [] };
  // A named flow (e.g. job-application) that can't be loaded shows an error
  // instead of the onboarding questions, which would be confusing.
  const fail = (errors) => (fallback ? { flow: defaultFlow, source: 'default', errors } : { flow: null, source: null, errors });
  let data;
  try {
    const res = await fetchImpl(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    data = await res.json();
  } catch (e) {
    log.error(
      `[openpath] Could not load the question file "${url}" (${e.message}).${fallback ? ' Showing the default onboarding questions instead.' : ''}`,
    );
    return fail([e.message]);
  }
  const errors = validateFlow(data);
  if (errors.length) {
    log.error(
      `[openpath] The question file "${url}" is invalid${fallback ? ', so the default onboarding questions are shown instead' : ''}. Problems:\n  - ${errors.join('\n  - ')}`,
    );
    return fail(errors);
  }
  return { flow: data, source: url, errors: [] };
}
