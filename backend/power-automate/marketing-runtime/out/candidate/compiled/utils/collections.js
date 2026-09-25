"use strict";
/**
 * Small helpers that keep the code within the ES5 + ES2015-core library the SPFx rig compiles against
 * (no Array.prototype.includes, Object.entries, Array.from or Set spreading).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.includes = includes;
exports.includesAny = includesAny;
exports.asStringArray = asStringArray;
exports.uniqueInOrder = uniqueInOrder;
exports.objectKeys = objectKeys;
function includes(list, value) {
    return list.indexOf(value) >= 0;
}
/** True when `value` is an array containing at least one of `candidates`. */
function includesAny(value, candidates) {
    return Array.isArray(value) && value.some((item) => includes(candidates, String(item)));
}
function asStringArray(value) {
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
}
function uniqueInOrder(list) {
    const result = [];
    for (const item of list) {
        if (!includes(result, item)) {
            result.push(item);
        }
    }
    return result;
}
function objectKeys(value) {
    return Object.keys(value);
}
