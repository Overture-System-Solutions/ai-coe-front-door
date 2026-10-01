/**
 * Conformance of the Binding A validators against the actual v0.1.1 fixture pairs, with mismatches versus the
 * generated 3.0.0.0 flow semantics kept visible. The static mock is not the acceptance simulator.
 */
import * as fs from 'fs';
import * as path from 'path';
import { CORE_OPERATIONS, parseRequest, parseResponse } from './coreContract';

const CONTRACT: string = path.join(process.cwd(), 'backend/core-compatibility/contract-v0.1.1');
const MOCK: string = path.join(CONTRACT, 'mock');
const INDEX: string = path.join(MOCK, 'index.json');

interface IPairIndex {
  pairs: { [operation: string]: string[] };
  count: number;
}

interface IPair {
  request: unknown;
  response: { Result?: string; Work?: { Version?: number; State?: string; Lane?: string | null }; Created?: boolean };
}

function loadPair(operation: string, name: string): IPair {
  return JSON.parse(fs.readFileSync(path.join(MOCK, operation, `${name}.json`), 'utf8')) as IPair;
}

describe('v0.1.1 fixture pair validation (operation-discriminated)', () => {
  const index: IPairIndex = JSON.parse(fs.readFileSync(INDEX, 'utf8')) as IPairIndex;

  it('pins the recorded 23 pairs', () => {
    expect(index.count).toBe(23);
    expect(Object.keys(index.pairs).sort()).toEqual([...CORE_OPERATIONS].sort());
  });

  it('validates every success and error envelope by operation, not by the ambiguous root oneOf', () => {
    let checked: number = 0;
    for (const operation of CORE_OPERATIONS) {
      for (const name of index.pairs[operation]) {
        const pair: IPair = loadPair(operation, name);
        const request = parseRequest(operation, pair.request);
        const response = parseResponse(operation, pair.response);
        if (name.indexOf('negative-missing-title') >= 0) {
          expect({ operation, name, requestValid: request.valid }).toEqual({ operation, name, requestValid: false });
          expect({ operation, name, responseValid: response.valid }).toEqual({ operation, name, responseValid: true });
        } else {
          expect({ operation, name, requestValid: request.valid, requestErrors: request.errors }).toEqual({
            operation,
            name,
            requestValid: true,
            requestErrors: []
          });
          expect({ operation, name, responseValid: response.valid, responseErrors: response.errors }).toEqual({
            operation,
            name,
            responseValid: true,
            responseErrors: []
          });
        }
        checked += 1;
      }
    }
    expect(checked).toBe(23);
  });

  it('keeps create Version 2 and Lane PREPARATION visible as fixture-vs-generated mismatches', () => {
    const created: IPair = loadPair('CreateOrResumeWork', 'CW-UAT-FAST-001-create-incomplete-s1');
    expect(created.response.Work?.Version).toBe(2);
    expect(created.response.Work?.Lane).toBe('PREPARATION');
    expect(created.response.Created).toBe(true);
  });

  it('keeps the replay fixture\'s Created:false visible against v0.1.1 §7a (preserve Created:true)', () => {
    const replay: IPair = loadPair('CreateOrResumeWork', 'CW-UAT-FAST-001-replay-same-idempotency-key');
    expect(replay.response.Created).toBe(false);
  });

  it('keeps ready-fixture DECISION_READY/PREPARATION visible against generated READY_FOR_* routing', () => {
    const ready: IPair = loadPair('RequestDecisionReadiness', 'CW-UAT-ARB-001-ready');
    expect(ready.response.Work?.State).toBe('DECISION_READY');
    expect(ready.response.Work?.Lane).toBe('PREPARATION');
  });
});

describe('shipped mock is not an authorization simulator', () => {
  it('replays cached negatives as HTTP 200, disagreeing with the first-call status mapping', () => {
    const source: string = fs.readFileSync(path.join(CONTRACT, 'mock_server.py'), 'utf8');
    expect(source).toContain('if key[1] and key in SEEN: return self._send(200, SEEN[key])');
    expect(source).toContain('200 if resp.get("Result") == "PASS"');
    expect(source).toContain('holds no state beyond memory');
  });
});

describe('generated-flow pins stay visible against fixtures', () => {
  it('records Version 1 / READY_FOR_ARB locally against fixture Version 2 / DECISION_READY', () => {
    const pins: { create: { generatedVersion: number; fixtureVersion: number }; readiness: { fixtureState: string; localEngineState: string } } =
      JSON.parse(fs.readFileSync(path.join(process.cwd(), 'backend/core-compatibility/generated-pins.json'), 'utf8')) as {
        create: { generatedVersion: number; fixtureVersion: number };
        readiness: { fixtureState: string; localEngineState: string };
      };
    expect(pins.create.generatedVersion).toBe(1);
    expect(pins.create.fixtureVersion).toBe(2);
    expect(pins.readiness.fixtureState).toBe('DECISION_READY');
    expect(pins.readiness.localEngineState).toBe('READY_FOR_ARB');
  });
});
