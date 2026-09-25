"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANUAL_SERVER_FIELDS = void 0;
exports.manualRequestErrors = manualRequestErrors;
const artifactTypes_1 = require("./artifactTypes");
const schema_1 = require("./schema");
exports.MANUAL_SERVER_FIELDS = ['schemaVersion', 'workId', 'briefId', 'planId', 'followThroughId', 'registerId', 'registerVersion', 'createdAt'];
/** Structural guard shared by browser and runtime. The actual artifact parser remains the sole schema validator. */
function manualRequestErrors(value) {
    const issues = [];
    if (!(0, schema_1.isPlainObject)(value))
        return ['Manual request must be an object.'];
    const allowed = ['workId', 'kind', 'payload', 'sourceIds', 'artifactId', 'expectedStoreVersion'];
    for (const key of Object.keys(value))
        if (!allowed.includes(key))
            issues.push({ path: key, message: 'is not a manual request field.' });
    (0, schema_1.workId)(value.workId, 'workId', issues);
    if (!artifactTypes_1.ARTIFACT_KINDS.includes(value.kind))
        issues.push({ path: 'kind', message: 'is not an artifact kind.' });
    if (!Array.isArray(value.sourceIds) || value.sourceIds.length > 50 || value.sourceIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 256))
        issues.push({ path: 'sourceIds', message: 'must be at most 50 source IDs.' });
    if (value.artifactId !== undefined) {
        (0, schema_1.canonicalId)(value.artifactId, 'artifactId', issues);
        if (typeof value.expectedStoreVersion !== 'string' || !value.expectedStoreVersion.trim() || value.expectedStoreVersion.length > 128)
            issues.push({ path: 'expectedStoreVersion', message: 'is required for an existing artifact.' });
    }
    else if (value.expectedStoreVersion !== undefined)
        issues.push({ path: 'expectedStoreVersion', message: 'must be absent for a new artifact.' });
    if (!(0, schema_1.isPlainObject)(value.payload))
        issues.push({ path: 'payload', message: 'must be an object.' });
    else {
        for (const key of exports.MANUAL_SERVER_FIELDS)
            if (Object.prototype.hasOwnProperty.call(value.payload, key))
                issues.push({ path: `payload.${key}`, message: 'is server-derived; submit content only.' });
        (0, schema_1.forbidKeysDeep)(value.payload, 'payload', issues);
        const walk = (item, path) => {
            if (Array.isArray(item)) {
                item.forEach((x, i) => walk(x, `${path}[${i}]`));
                return;
            }
            if (!(0, schema_1.isPlainObject)(item))
                return;
            for (const key of Object.keys(item)) {
                if (['state', 'createdby', 'actorid', 'tenantscope', 'roles', 'permissions', 'envelope', 'providerprovenance', 'provenance', 'receipt', 'receiptrefs'].includes(key.toLowerCase())
                    || (key === 'authorityBindingRef' && item[key] !== null) || (key === 'status' && item[key] === 'accepted') || (key === 'acceptance' && item[key] !== null))
                    issues.push({ path: `${path}.${key}`, message: 'cannot assert identity, authority or acceptance.' });
                walk(item[key], `${path}.${key}`);
            }
        };
        walk(value.payload, 'payload');
    }
    return (0, schema_1.formatIssues)(issues);
}
