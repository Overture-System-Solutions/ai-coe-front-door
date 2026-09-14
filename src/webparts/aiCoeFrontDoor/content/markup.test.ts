import { parseMarkup } from './markup';

describe('in-text markup', () => {
  it('returns plain text as one node and nothing for an empty string', () => {
    expect(parseMarkup('Just words.')).toEqual([{ kind: 'text', text: 'Just words.' }]);
    expect(parseMarkup('')).toEqual([]);
  });

  it('tokenises links, strong and emphasised runs in order', () => {
    expect(parseMarkup('a [b](https://x/y) c **d** e *f*')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'link', label: 'b', href: 'https://x/y' },
      { kind: 'text', text: ' c ' },
      { kind: 'strong', text: 'd' },
      { kind: 'text', text: ' e ' },
      { kind: 'em', text: 'f' }
    ]);
    expect(parseMarkup('**Do this**: ask Copilot: *Is there anything?*')).toEqual([
      { kind: 'strong', text: 'Do this' },
      { kind: 'text', text: ': ask Copilot: ' },
      { kind: 'em', text: 'Is there anything?' }
    ]);
  });

  it('keeps brackets and lone asterisks literal', () => {
    expect(parseMarkup('[describe it]. Ask * me ** now')).toEqual([{ kind: 'text', text: '[describe it]. Ask * me ** now' }]);
    expect(parseMarkup('**')).toEqual([{ kind: 'text', text: '**' }]);
    expect(parseMarkup('*unfinished')).toEqual([{ kind: 'text', text: '*unfinished' }]);
  });

  it('starts a link at the innermost bracket', () => {
    expect(parseMarkup('[describe it]. Then [Requests](SitePages/R.aspx).')).toEqual([
      { kind: 'text', text: '[describe it]. Then ' },
      { kind: 'link', label: 'Requests', href: 'SitePages/R.aspx' },
      { kind: 'text', text: '.' }
    ]);
    expect(parseMarkup('[a [b](x)')).toEqual([
      { kind: 'text', text: '[a ' },
      { kind: 'link', label: 'b', href: 'x' }
    ]);
  });

  it('renders a link without a target as its label', () => {
    expect(parseMarkup('See [label]() now')).toEqual([{ kind: 'text', text: 'See label now' }]);
  });

  it('keeps line breaks inside text', () => {
    expect(parseMarkup('one\ntwo')).toEqual([{ kind: 'text', text: 'one\ntwo' }]);
  });

  it('resolves site paths and other targets untouched', () => {
    expect(parseMarkup('[Requests](SitePages/Requests.aspx)')).toEqual([{ kind: 'link', label: 'Requests', href: 'SitePages/Requests.aspx' }]);
    expect(parseMarkup('[mail](mailto:coe@contoso.com)')).toEqual([{ kind: 'link', label: 'mail', href: 'mailto:coe@contoso.com' }]);
  });
});
