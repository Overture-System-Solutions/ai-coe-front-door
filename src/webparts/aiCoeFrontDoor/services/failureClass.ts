/**
 * Failure classes for the SharePoint reads and writes the services make. A class names what went
 * wrong in words the page can show and the operator can act on; the response body never travels
 * with it (bodies can quote server internals or a person's data), so the console and the page views
 * see the status and the class only. The shipped `message` on each result keeps its wording.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

export type FailureClass = 'PERMISSION' | 'SOURCE' | 'TRANSIENT' | 'IMPLEMENTATION' | 'INCONCLUSIVE';

/** The label each class shows on the user plane (the operator plane appends the class code). */
export const FAILURE_LABELS: { [failureClass in FailureClass]: string } = {
  PERMISSION: 'Needs access',
  SOURCE: 'Not available on this site',
  TRANSIENT: 'Not available right now; try again',
  IMPLEMENTATION: 'Not supported',
  INCONCLUSIVE: 'Saved, not yet confirmed'
};

/** An error raised for a non-2xx response; the message may quote the body, the status never does. */
export interface IStatusError extends Error {
  status: number;
  /** What was asked, usually a list title. */
  subject: string;
}

const LOG_TEXT_LIMIT: number = 200;

/** `<subject> returned <status>: <body>` (the shipped wording) with the status and subject kept beside it. */
export function statusError(subject: string, status: number, body: string): IStatusError {
  const error: IStatusError = new Error(`${subject} returned ${status}: ${body}`) as IStatusError;
  error.status = status;
  error.subject = subject;
  return error;
}

function isStatusError(error: unknown): error is IStatusError {
  return error instanceof Error && typeof (error as IStatusError).status === 'number' && typeof (error as IStatusError).subject === 'string';
}

/** The HTTP status an error remembers, or undefined for an error raised before any response came. */
export function errorStatus(error: unknown): number | undefined {
  return isStatusError(error) ? error.status : undefined;
}

export function classifyStatus(status: number): FailureClass {
  if (status === 401 || status === 403) {
    return 'PERMISSION';
  }
  if (status === 404) {
    return 'SOURCE';
  }
  if (status === 408 || status === 429 || status >= 500) {
    return 'TRANSIENT';
  }
  if (status >= 400) {
    return 'IMPLEMENTATION';
  }
  return 'TRANSIENT';
}

export function classifyResponse(response: { status: number }): FailureClass {
  return classifyStatus(response.status);
}

/** A status error classifies by its status; anything else came before a response (network) and is transient. */
export function classifyError(error: unknown): FailureClass {
  const status: number | undefined = errorStatus(error);
  return status === undefined ? 'TRANSIENT' : classifyStatus(status);
}

/** The body-free sentence a result carries for the page; the shipped `message` stays beside it. */
export function failureUserMessage(failureClass: FailureClass): string {
  return `${FAILURE_LABELS[failureClass]}.`;
}

/** What the console gets: subject, status and class for a response; class and error text otherwise. Never a body. */
export function failureLogDetail(error: unknown): string {
  const failureClass: FailureClass = classifyError(error);
  if (isStatusError(error)) {
    return `${error.subject} returned ${error.status} (${failureClass})`;
  }
  const text: string = error instanceof Error ? error.message : String(error);
  return `${failureClass}: ${text.slice(0, LOG_TEXT_LIMIT)}`;
}
