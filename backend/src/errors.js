// One error shape everywhere: { error: { code, message, field? } }

export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export function errorBody(code, message, field) {
  const error = { code, message };
  if (field) error.field = field;
  return { error };
}

// Plain-language messages for answer validation codes from shared/flow.js.
export const ANSWER_MESSAGES = {
  required: 'This question needs an answer.',
  invalid_type: 'This answer is not in the expected format.',
  too_long: 'This answer is too long.',
  invalid_phone: 'Enter a mobile number for the country of this question, for Ethiopia 09... or 07... (10 digits).',
  invalid_date: 'Enter a real date, with day, month and year.',
  future_date: 'The date cannot be in the future.',
  calendar_mismatch: 'The Gregorian date and the Ethiopian date in this answer do not match.',
  invalid_option: 'Choose one of the listed options.',
  not_answerable: 'This screen does not take an answer.',
  unknown_question: 'There is no question with this id in the flow.',
};

export function answerError(e) {
  return new ApiError(
    e.code === 'required' ? 422 : 400,
    e.code,
    ANSWER_MESSAGES[e.code] ?? 'This answer is not valid.',
    e.field ?? undefined,
  );
}

// Final error handler. Never leaks stack traces or internals.
export function errorHandler(log = console) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json(errorBody(err.code, err.message, err.field));
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json(errorBody('payload_too_large', 'The request body is too large.'));
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json(errorBody('invalid_json', 'The request body is not valid JSON.'));
    }
    if (err?.type === 'encoding.unsupported' || err?.status === 415) {
      return res.status(415).json(errorBody('unsupported_media_type', 'Send the request body as JSON.'));
    }
    log.error('[openpath] unexpected error', err);
    return res.status(500).json(errorBody('internal', 'Something went wrong on our side. Your answers are still saved on your device.'));
  };
}
