'use strict';
/** Callable extension of the EXISTING canonical writer. No HTTP listener, daemon, schedule or new host. */
const { MarketingRuntime } = require('./runtime.cjs');
const { listUrl } = require('./sharepoint.cjs');
function createMarketingInvocation({ config, sp, invokeClaude, runAsCanonicalWriter }) {
  if (!config || config.enabled !== true) throw new Error('Marketing invocation disabled; explicit qualified bindings required.');
  for (const key of ['canonicalListId', 'requestListId', 'resultListId']) listUrl(config, key);
  if (new Set([config.canonicalListId, config.requestListId, config.resultListId].map(id => id.toLowerCase())).size !== 3 || !Number.isSafeInteger(config.writerPrincipalId) || config.writerPrincipalId < 1 || config.readRoleDefinitionId !== 1073741826 || !/^QUAL-[A-Za-z0-9_-]+$/.test(config.qualificationReceiptRef) || !/^QUAL-[A-Za-z0-9_-]+$/.test(config.provider?.qualificationReceiptRef) || typeof config.provider?.model !== 'string' || !config.provider.model.trim() || typeof sp?.request !== 'function' || typeof invokeClaude !== 'function' || typeof runAsCanonicalWriter !== 'function') throw new Error('Marketing host binding incomplete.');
  // Snapshot configuration; caller mutation cannot silently switch lists after qualification.
  const binding = JSON.parse(JSON.stringify(config));
  return async input => {
    if (!input || Object.keys(input).length !== 1 || !Number.isSafeInteger(input.requestItemId) || input.requestItemId < 1) throw new Error('Invocation accepts an immutable request item reference only.');
    return runAsCanonicalWriter({ extension: 'marketing.v1', siteUrl: binding.siteUrl, requestItemId: input.requestItemId }, async () => {
      const result = await new MarketingRuntime({ config: binding, sp, invokeClaude }).execute(input.requestItemId);
      // Control-plane return is content-free; authorized browser reads the private result projection.
      return { protocol: result.protocol, requestId: result.requestId, operation: result.operation, projectionConfirmed: true };
    });
  };
}
module.exports = { createMarketingInvocation };
