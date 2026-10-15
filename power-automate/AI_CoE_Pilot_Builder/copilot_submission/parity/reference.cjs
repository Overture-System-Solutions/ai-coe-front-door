'use strict';
/*
 * Parity reference: runs the front door's own TypeScript (read-only, transpiled in memory) on the answers the Copilot
 * flow saved, and prints the SharePoint POST bodies the front door would have sent for the same submission.
 *
 *   node reference.cjs <front-door folder> < cases.json > result.json
 *
 * The list client is an in-memory fake (it records POSTs and reads them back); nothing is sent anywhere. Only one step
 * is mirrored rather than imported: IdeaWorkflow.tsx's buildPayload (a React file), which only assembles
 * { submissionId, createdAt, workflowId, workflowVersion, originalAnswers, confirmedSummary, reviewIndicators, status }.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const FRONT_DOOR = process.argv[2];
const ts = require(path.join(FRONT_DOOR, 'node_modules', 'typescript'));
const SRC = path.join(FRONT_DOOR, 'src', 'webparts', 'aiCoeFrontDoor');
const SITE = process.argv[3];

const stub = new Proxy(function () { return null; }, { get: (target, key) => (key === '__esModule' ? true : stub) });
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'react' || request === 'lucide-react' || /(^|\/)icons$/.test(request)) {
    return stub;
  }
  return originalLoad.apply(this, arguments);
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent) {
  if (request.startsWith('.') && parent && parent.filename) {
    const base = path.resolve(path.dirname(parent.filename), request);
    for (const candidate of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return originalResolve.apply(this, arguments);
};
const compile = function (module, filename) {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, jsx: ts.JsxEmit.React, esModuleInterop: true }
  });
  if (out.diagnostics && out.diagnostics.length) {
    throw new Error(filename + ': ' + ts.flattenDiagnosticMessageText(out.diagnostics[0].messageText, '\n'));
  }
  module._compile(out.outputText, filename);
};
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;

const load = (relative) => require(path.join(SRC, relative));
const { createIdeaWorkflow } = load('content/workflows/idea.ts');
const { createFeedbackWorkflow } = load('content/workflows/feedback.ts');
const { buildIdeaSummaryDraft, ideaReviewIndicators } = load('summaries/ideaSummary.ts');
const { buildFeedbackRecord } = load('summaries/feedbackSummary.ts');
const { applyReviewPriority } = load('services/executivePriority.ts');
const { GovernanceService } = load('services/GovernanceService.ts');

function response(status, body) {
  const text = JSON.stringify(body);
  return { ok: status < 400, status, text: async () => text, json: async () => JSON.parse(text) };
}

function describe(definition) {
  return definition.steps.map((step) => ({
    id: step.id, type: step.type, title: step.title, required: step.required === true,
    options: (step.options || []).map((option) => [option.value, option.label])
  }));
}

async function runCase(item) {
  const posts = [];
  const client = {
    post: async (url, configuration, options) => {
      const body = JSON.parse(options.body);
      posts.push({ list: /getbytitle\('(.*)'\)\/items$/.exec(url)[1], body });
      return response(201, Object.assign({ Id: posts.length }, body));
    },
    get: async (url) => {
      const match = /items\((\d+)\)/.exec(url);
      const posted = match ? posts[Number(match[1]) - 1] : undefined;
      return posted ? response(200, { Id: Number(match[1]), IntakeId: posted.body.IntakeId, Modified: item.now }) : response(404, {});
    }
  };
  const context = { siteUrl: SITE, user: { displayName: item.user.name, email: item.user.email }, client, configuration: {} };
  const service = new GovernanceService(context, () => new Date(item.now), () => item.intakeId);
  let result;
  if (item.kind === 'idea') {
    const definition = createIdeaWorkflow();
    let payload = {
      submissionId: 'idea-reference',
      createdAt: item.now,
      workflowId: definition.id,
      workflowVersion: definition.workflowVersion,
      originalAnswers: item.answers,
      confirmedSummary: buildIdeaSummaryDraft(definition, item.answers),
      reviewIndicators: ideaReviewIndicators(item.answers),
      status: 'confirmed'
    };
    payload = applyReviewPriority(payload, item.leader === true);
    result = await service.submitWorkflow('idea', payload);
  } else {
    const definition = createFeedbackWorkflow();
    const record = buildFeedbackRecord(definition, item.answers, [], new Date(item.now), () => 'feedback-reference');
    result = await service.submitWorkflow('feedback', record);
  }
  return { id: item.id, state: result.state, posts };
}

(async () => {
  const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
  const out = { definitions: { idea: describe(createIdeaWorkflow()), feedback: describe(createFeedbackWorkflow()) }, cases: [] };
  for (const item of cases) {
    out.cases.push(await runCase(item));
  }
  process.stdout.write(JSON.stringify(out));
})().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
