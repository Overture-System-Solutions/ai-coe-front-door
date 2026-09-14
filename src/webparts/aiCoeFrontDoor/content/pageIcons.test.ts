import { Lightbulb, MessageSquare } from '../icons';
import { DEFAULT_PAGE_ICON, pageIcon } from './pageIcons';

describe('page icons', () => {
  it('resolves a shipped icon by its exported name and falls back to the light bulb', () => {
    expect(DEFAULT_PAGE_ICON).toBe('Lightbulb');
    expect(pageIcon('MessageSquare')).toBe(MessageSquare);
    expect(pageIcon('Lightbulb')).toBe(Lightbulb);
    expect(pageIcon(undefined)).toBe(Lightbulb);
    expect(pageIcon('NoSuchIcon')).toBe(Lightbulb);
    expect(pageIcon('messagesquare')).toBe(Lightbulb);
    expect(pageIcon('hasOwnProperty')).toBe(Lightbulb);
    expect(pageIcon('__esModule')).toBe(Lightbulb);
  });
});
