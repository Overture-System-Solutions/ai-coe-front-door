import { browserNavigate, createNavigator } from './navigation';
import type { Navigate } from './navigation';

describe('navigation', () => {
  it('createNavigator assigns the url on the window it was given', () => {
    const assign: jest.Mock = jest.fn();
    const navigate: Navigate = createNavigator({ location: { assign } });
    expect(assign).not.toHaveBeenCalled();
    navigate('https://contoso.sharepoint.com/sites/ai/SitePages/Requests.aspx');
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('https://contoso.sharepoint.com/sites/ai/SitePages/Requests.aspx');
  });

  it('browserNavigate is a plain function over the real window', () => {
    // jsdom cannot perform navigation, so only the shape is pinned here; the shell tests inject a fake.
    expect(typeof browserNavigate).toBe('function');
  });
});
