import * as React from 'react';
import { isExternalHref } from '../../content/links';
import { parseMarkup } from '../../content/markup';
import type { MarkupNode } from '../../content/markup';
import { resolveContentHref } from '../../content/pageContent';
import { useFrontDoor } from '../../context/FrontDoorContext';

export interface IMarkupProps {
  /** Text with in-text markup: `[label](href)`, `**strong**`, `*em*`. */
  text: string;
}

/** Anchor attributes for a resolved target: URLs on another origin (Teams, other tenants) open in a new tab. */
export function anchorProps(siteUrl: string, href: string): React.AnchorHTMLAttributes<HTMLAnchorElement> {
  return isExternalHref(siteUrl, href) ? { href, target: '_blank', rel: 'noopener noreferrer' } : { href };
}

/** Renders page text with its in-text markup; links resolve against the site. */
export function Markup({ text }: IMarkupProps): React.ReactElement {
  const { siteUrl } = useFrontDoor();
  const nodes: MarkupNode[] = parseMarkup(text);
  return (
    <>
      {nodes.map((node: MarkupNode, index: number): React.ReactNode => {
        switch (node.kind) {
          case 'strong':
            return <strong key={index}>{node.text}</strong>;
          case 'em':
            return <em key={index}>{node.text}</em>;
          case 'link':
            return (
              <a key={index} {...anchorProps(siteUrl, resolveContentHref(siteUrl, node.href))}>
                {node.label}
              </a>
            );
          default:
            return <React.Fragment key={index}>{node.text}</React.Fragment>;
        }
      })}
    </>
  );
}
