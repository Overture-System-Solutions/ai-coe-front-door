/**
 * In-text markup for page content: `[label](href)`, `**strong**` and `*em*` runs inside a string.
 * Flat by design (no nesting), so a page owner editing the JSON document cannot break a page with
 * a stray character: anything that is not a complete run stays literal text.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

export type MarkupNode = { kind: 'text'; text: string } | { kind: 'strong'; text: string } | { kind: 'em'; text: string } | { kind: 'link'; label: string; href: string };

const RUN: RegExp = /\[([^[\]\n]+)\]\(([^)\s]*)\)|\*\*(\S(?:[^*\n]*?\S)?)\*\*|\*(\S(?:[^*\n]*?\S)?)\*/g;

function pushText(nodes: MarkupNode[], text: string): void {
  if (text === '') {
    return;
  }
  const last: MarkupNode | undefined = nodes[nodes.length - 1];
  if (last !== undefined && last.kind === 'text') {
    last.text += text;
    return;
  }
  nodes.push({ kind: 'text', text });
}

/** Splits a string into text, strong, em and link nodes; a link with a blank target becomes its label. */
export function parseMarkup(text: string): MarkupNode[] {
  const nodes: MarkupNode[] = [];
  const pattern: RegExp = RUN;
  pattern.lastIndex = 0;
  let last: number = 0;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    pushText(nodes, text.slice(last, match.index));
    if (match[1] !== undefined) {
      if (match[2] === '') {
        pushText(nodes, match[1]);
      } else {
        nodes.push({ kind: 'link', label: match[1], href: match[2] });
      }
    } else if (match[3] !== undefined) {
      nodes.push({ kind: 'strong', text: match[3] });
    } else {
      nodes.push({ kind: 'em', text: match[4] });
    }
    last = match.index + match[0].length;
    match = pattern.exec(text);
  }
  pushText(nodes, text.slice(last));
  return nodes;
}
