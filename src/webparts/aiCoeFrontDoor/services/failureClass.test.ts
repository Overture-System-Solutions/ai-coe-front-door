import { classifyError, classifyResponse, classifyStatus, errorStatus, FAILURE_LABELS, failureLogDetail, failureUserMessage, statusError } from './failureClass';
import type { FailureClass, IStatusError } from './failureClass';

const SECRET_BODY: string = '{"error":{"message":"Access denied. You do not have permission. token=eyJabc"}}';

describe('classifyStatus and classifyResponse', () => {
  it('maps the status table', () => {
    expect(classifyStatus(401)).toBe('PERMISSION');
    expect(classifyStatus(403)).toBe('PERMISSION');
    expect(classifyStatus(404)).toBe('SOURCE');
    expect(classifyStatus(408)).toBe('TRANSIENT');
    expect(classifyStatus(429)).toBe('TRANSIENT');
    expect(classifyStatus(500)).toBe('TRANSIENT');
    expect(classifyStatus(502)).toBe('TRANSIENT');
    expect(classifyStatus(503)).toBe('TRANSIENT');
    expect(classifyStatus(400)).toBe('IMPLEMENTATION');
    expect(classifyStatus(409)).toBe('IMPLEMENTATION');
    expect(classifyStatus(415)).toBe('IMPLEMENTATION');
    expect(classifyStatus(422)).toBe('IMPLEMENTATION');
  });

  it('treats a missing status (no response) as transient', () => {
    expect(classifyStatus(0)).toBe('TRANSIENT');
    expect(classifyStatus(Number.NaN)).toBe('TRANSIENT');
  });

  it('reads the status of a response', () => {
    expect(classifyResponse({ status: 403 })).toBe('PERMISSION');
    expect(classifyResponse({ status: 404 })).toBe('SOURCE');
    expect(classifyResponse({ status: 500 })).toBe('TRANSIENT');
    expect(classifyResponse({ status: 400 })).toBe('IMPLEMENTATION');
  });
});

describe('statusError and classifyError', () => {
  it('builds the shipped message and remembers the status and subject', () => {
    const error: IStatusError = statusError('AI CoE Pilot Intakes', 500, 'boom');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('AI CoE Pilot Intakes returned 500: boom');
    expect(error.status).toBe(500);
    expect(error.subject).toBe('AI CoE Pilot Intakes');
    expect(errorStatus(error)).toBe(500);
  });

  it('classifies a status error by its status', () => {
    expect(classifyError(statusError('AI CoE Decisions', 403, 'Access denied'))).toBe('PERMISSION');
    expect(classifyError(statusError('AI CoE Decisions', 404, 'List not found'))).toBe('SOURCE');
    expect(classifyError(statusError('AI CoE Decisions', 429, 'slow down'))).toBe('TRANSIENT');
    expect(classifyError(statusError('AI CoE Decisions', 400, 'bad field'))).toBe('IMPLEMENTATION');
  });

  it('classifies a plain error, a string and nothing at all as transient (network)', () => {
    expect(classifyError(new Error('Failed to fetch'))).toBe('TRANSIENT');
    expect(classifyError('boom')).toBe('TRANSIENT');
    expect(classifyError(undefined)).toBe('TRANSIENT');
    expect(errorStatus(new Error('Failed to fetch'))).toBeUndefined();
    expect(errorStatus({ status: 'nope' })).toBeUndefined();
  });
});

describe('failureUserMessage', () => {
  const CLASSES: FailureClass[] = ['PERMISSION', 'SOURCE', 'TRANSIENT', 'IMPLEMENTATION', 'INCONCLUSIVE'];

  it('uses the contract labels', () => {
    expect(FAILURE_LABELS).toEqual({
      PERMISSION: 'Needs access',
      SOURCE: 'Not available on this site',
      TRANSIENT: 'Not available right now; try again',
      IMPLEMENTATION: 'Not supported',
      INCONCLUSIVE: 'Saved, not yet confirmed'
    });
    expect(failureUserMessage('PERMISSION')).toBe('Needs access.');
    expect(failureUserMessage('SOURCE')).toBe('Not available on this site.');
    expect(failureUserMessage('TRANSIENT')).toBe('Not available right now; try again.');
    expect(failureUserMessage('IMPLEMENTATION')).toBe('Not supported.');
    expect(failureUserMessage('INCONCLUSIVE')).toBe('Saved, not yet confirmed.');
  });

  it('never carries the response body, whatever the status', () => {
    for (const status of [400, 401, 403, 404, 408, 429, 500, 503]) {
      const error: IStatusError = statusError('AI CoE Pilot Intakes', status, SECRET_BODY);
      const message: string = failureUserMessage(classifyError(error));
      expect(message).not.toContain('token');
      expect(message).not.toContain('permission');
      expect(message).not.toContain(String(status));
      expect(message).not.toContain('AI CoE Pilot Intakes');
    }
    for (const failureClass of CLASSES) {
      expect(failureUserMessage(failureClass)).toBe(`${FAILURE_LABELS[failureClass]}.`);
    }
  });
});

describe('failureLogDetail', () => {
  it('names the subject, the status and the class, never the body', () => {
    const detail: string = failureLogDetail(statusError('AI CoE Pilot Intakes', 403, SECRET_BODY));
    expect(detail).toBe('AI CoE Pilot Intakes returned 403 (PERMISSION)');
  });

  it('names the class and the error text for an error without a status', () => {
    expect(failureLogDetail(new Error('Failed to fetch'))).toBe('TRANSIENT: Failed to fetch');
    expect(failureLogDetail('boom')).toBe('TRANSIENT: boom');
  });
});
