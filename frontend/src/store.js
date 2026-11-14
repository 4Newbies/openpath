// Form state: current step, answers, display preferences and the server
// session. Written to localStorage on every change and restored on load.

// One saved form per flow; with a scope (e.g. a job id) one per flow and scope,
// so an application for one job never carries over to another.
export const storageKey = (flow, scope) => `openpath:${flow.flowId}${scope ? `:${scope}` : ''}`;

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // blocked by privacy settings
  }
}

export function createStore(flow, { storage = safeStorage(), scope } = {}) {
  const key = storageKey(flow, scope && /^[A-Za-z0-9_-]{1,64}$/.test(scope) ? scope : undefined);
  const known = new Set(flow.questions.map((q) => q.id));
  const prefQuestion = flow.questions.find((q) => q.setsPreference === 'access');
  const listeners = new Set();

  const fresh = () => ({
    flowVersion: flow.version,
    step: null,
    returnToReview: false,
    answers: {},
    preferences: { access: [] },
    sessionId: null,
    resumeCode: null,
    clientKey: null, // makes creating the server session safe to repeat
    pendingSubmit: false, // "Send" was pressed while the server was unreachable
  });

  function read() {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      // A new version of the question file starts over.
      if (!saved || saved.flowVersion !== flow.version || typeof saved.answers !== 'object') return null;
      const answers = Object.fromEntries(Object.entries(saved.answers).filter(([id]) => known.has(id)));
      return { ...fresh(), ...saved, answers, preferences: { access: [], ...saved.preferences } };
    } catch {
      return null;
    }
  }

  const restoredState = read();
  let state = restoredState ?? fresh();

  function commit(next) {
    state = next;
    try {
      storage?.setItem(key, JSON.stringify(state));
    } catch {
      /* storage full or blocked: keep working in memory */
    }
    for (const fn of listeners) fn(state);
  }

  return {
    restored: Boolean(restoredState),
    get state() {
      return state;
    },
    setAnswer(id, value) {
      const answers = { ...state.answers };
      if (value === undefined) delete answers[id];
      else answers[id] = value;
      const preferences =
        prefQuestion && id === prefQuestion.id ? { ...state.preferences, access: Array.isArray(value) ? value : [] } : state.preferences;
      commit({ ...state, answers, preferences });
    },
    setStep(step, { returnToReview = state.returnToReview } = {}) {
      commit({ ...state, step, returnToReview });
    },
    setSession(sessionId, resumeCode) {
      commit({ ...state, sessionId, resumeCode });
    },
    setClientKey(clientKey) {
      commit({ ...state, clientKey });
    },
    setPendingSubmit(pendingSubmit) {
      commit({ ...state, pendingSubmit });
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        /* ignore */
      }
      state = fresh();
      for (const fn of listeners) fn(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
