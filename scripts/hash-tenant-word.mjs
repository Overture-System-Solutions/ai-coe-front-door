// Makes the hashed entry of the tenant word list (src/provisioning/tenantWords.json) for one word, so a client name,
// a roster surname or a case id is added to the list without being written into the repository.
//
//   node scripts/hash-tenant-word.mjs <list>          the word is read from standard input (one line)
//
// <list> is one of clientWords, bundlePhrases, hosts, people, caseIds, secretPatterns. Prints the entry as JSON,
// { "sha256": …, "length": …, "probe": … }, to paste into that list; clientWords (and hosts) are matched in any case,
// so their word is hashed with A-Z lower-cased. A case-id expression is added as its literals, one entry each.
// Type the word at the prompt or pipe it in; do not pass it as an argument, which would leave it in the shell history.
import { readFileSync } from 'node:fs';
import { hashTenantWord, TENANT_WORD_LISTS } from './tenant-words.mjs';

const list = process.argv[2];
if (!TENANT_WORD_LISTS.includes(list) || process.argv.length > 3) {
  console.error(`Usage: node scripts/hash-tenant-word.mjs <${TENANT_WORD_LISTS.join('|')}>  (the word is read from standard input)`);
  process.exit(2);
}
if (process.stdin.isTTY) {
  process.stderr.write(`Word for ${list}: `);
}
const word = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
if (word.length === 0) {
  console.error('No word read from standard input.');
  process.exit(2);
}
console.log(JSON.stringify(hashTenantWord(word, list)));
