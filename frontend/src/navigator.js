import { isVisible, visibleQuestions } from '../../shared/flow.js';

export const REVIEW = 'review';

/** Works out which step comes next or before, honouring showIf. */
export function createNavigator(flow) {
  const order = flow.questions.map((q) => q.id);
  const byId = new Map(flow.questions.map((q) => [q.id, q]));
  const shows = (id, answers) => isVisible(byId.get(id), answers, flow);

  return {
    first(answers) {
      return visibleQuestions(flow, answers)[0]?.id ?? REVIEW;
    },
    next(current, answers) {
      if (current === REVIEW) return REVIEW;
      for (let i = order.indexOf(current) + 1; i < order.length; i++) if (shows(order[i], answers)) return order[i];
      return REVIEW;
    },
    back(current, answers) {
      const start = current === REVIEW ? order.length : order.indexOf(current);
      for (let i = start - 1; i >= 0; i--) if (shows(order[i], answers)) return order[i];
      return null;
    },
    /** 1-based position among the questions that currently show. */
    position(current, answers) {
      const visible = visibleQuestions(flow, answers).map((q) => q.id);
      return { index: visible.indexOf(current) + 1, total: visible.length };
    },
    /** Turn a saved step into one that is valid now (it may have been hidden). */
    resolve(step, answers) {
      if (step === REVIEW) return REVIEW;
      if (!step || !byId.has(step)) return this.first(answers);
      if (shows(step, answers)) return step;
      return this.next(step, answers);
    },
    question: (id) => byId.get(id),
  };
}
