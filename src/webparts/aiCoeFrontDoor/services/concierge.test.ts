import { CONCIERGE_NAME, CONCIERGE_INTRODUCED_KEY, parseConcierge } from './concierge';

const CHAT: string = 'https://m365.cloud.microsoft/chat/?titleId=T_90a94581-0aa2-7ff7-625d-5fe358e84502&source=agentCenterDialog';
const ADD: string = 'https://teams.microsoft.com/l/app/?titleId=T_90a94581-0aa2-7ff7-625d-5fe358e84502';

describe('parseConcierge', () => {
  it('names the agent and the browser flag it is introduced under', () => {
    expect(CONCIERGE_NAME).toBe('AI CoE Concierge');
    expect(CONCIERGE_INTRODUCED_KEY).toBe('overture-ai-coe-front-door:concierge-introduced');
  });

  it('takes the Copilot chat link and the Teams add link exactly as given', () => {
    expect(parseConcierge(CHAT, ADD)).toEqual({ chatUrl: CHAT, addUrl: ADD });
    expect(parseConcierge(`  ${CHAT}  `, ` ${ADD} `)).toEqual({ chatUrl: CHAT, addUrl: ADD });
  });

  it('accepts the new Copilot address and the Teams chat hosts too', () => {
    expect(parseConcierge('https://copilot.cloud.microsoft/chat/?titleId=T_1')?.chatUrl).toBe('https://copilot.cloud.microsoft/chat/?titleId=T_1');
    expect(parseConcierge('https://teams.cloud.microsoft/l/app/x')?.chatUrl).toBe('https://teams.cloud.microsoft/l/app/x');
  });

  it('is not set up without a chat link, and keeps a chat link without an add link', () => {
    expect(parseConcierge(undefined, ADD)).toBeUndefined();
    expect(parseConcierge('', ADD)).toBeUndefined();
    expect(parseConcierge(CHAT, '')).toEqual({ chatUrl: CHAT });
    expect(parseConcierge(CHAT)).toEqual({ chatUrl: CHAT });
  });

  it.each([
    'http://m365.cloud.microsoft/chat/',
    'https://m365.cloud.microsoft.evil.example/chat/',
    'https://example.com/?u=https://m365.cloud.microsoft/',
    // eslint-disable-next-line no-script-url -- the refused value itself
    'javascript:alert(1)',
    'not a link',
    'https://user@m365.cloud.microsoft/chat/'
  ])('refuses %s, so only an https Microsoft Copilot or Teams address can open', (value: string) => {
    expect(parseConcierge(value)).toBeUndefined();
    expect(parseConcierge(CHAT, value)).toEqual({ chatUrl: CHAT });
  });
});
