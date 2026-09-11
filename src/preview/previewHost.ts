/**
 * Offline preview host for the built web part bundle (`npm run preview`).
 *
 * Runs in the browser as a module script and simulates the parts of the SharePoint Framework the
 * bundle needs: `BaseClientSideWebPart`, the page context, permissions and an in-memory SharePoint
 * list store. Every response is simulated and all external network access is blocked; nothing here
 * contacts a tenant. Compiled to lib/preview/previewHost.js and served as /host.js.
 *
 * Written without spread, rest or async/await on purpose: the ES5 build would otherwise import
 * tslib helpers, which a browser cannot resolve from a bare module specifier.
 */

interface IPreviewItem {
  Id: number;
  [field: string]: unknown;
}

interface IPreviewRequest {
  method: 'GET' | 'POST';
  list: string;
  body: unknown;
  simulated: true;
}

interface IPreviewResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

interface IPreviewWebPart {
  onInit(): Promise<void>;
  render(): void;
  onDispose(): void;
  properties: { [name: string]: unknown };
}

interface IPreviewApi {
  mode: 'OFFLINE_SIMULATION';
  requests: IPreviewRequest[];
  lists: { [title: string]: IPreviewItem[] };
  mount(properties: { [name: string]: unknown }): Promise<IPreviewWebPart>;
  setOrganizationName(name: string): void;
}

type AmdFactory = (...modules: unknown[]) => { default: new () => IPreviewWebPart };

interface IPreviewWindow {
  React: unknown;
  ReactDOM: unknown;
  define: unknown;
  FrontDoorPreview: IPreviewApi;
}

const LIST_TITLES: string[] = ['AI CoE Pilot Intakes', 'AI CoE Use Cases', 'AI CoE Decisions', 'AI Usage Daily', 'AI CoE Incidents'];
const previewWindow: IPreviewWindow = window as unknown as IPreviewWindow;
const lists: { [title: string]: IPreviewItem[] } = {};
const requests: IPreviewRequest[] = [];
let nextId: number = 1;
let webPartClass: (new () => IPreviewWebPart) | undefined;
let strings: { [key: string]: string } = {};
let mounted: IPreviewWebPart | undefined;
let pendingProperties: { [name: string]: unknown } = {};

for (let index: number = 0; index < LIST_TITLES.length; index++) {
  lists[LIST_TITLES[index]] = [];
}

function blocked(): never {
  throw new Error('External network access is blocked in the offline preview.');
}

// Belt and braces: the bundle never calls these, but the preview must stay offline even if it did.
window.fetch = blocked;
window.XMLHttpRequest = function XMLHttpRequest(): void {
  blocked();
} as unknown as typeof XMLHttpRequest;
window.WebSocket = blocked as unknown as typeof WebSocket;
window.open = blocked;
document.addEventListener('click', (event: MouseEvent): void => {
  const target: Element | null = event.target as Element | null;
  const link: HTMLAnchorElement | null = target === null ? null : target.closest('a[href]');
  if (link !== null && link.href.indexOf('blob:') !== 0 && (link.getAttribute('href') ?? '').indexOf('#') !== 0) {
    event.preventDefault();
  }
});

function request(method: 'GET' | 'POST', url: string, options: { body?: string } | undefined): Promise<IPreviewResponse> {
  const match: RegExpMatchArray | null = String(url).match(/getbytitle\('((?:[^']|'')+)'\)\/items/);
  const list: string | undefined = match === null ? undefined : match[1].replace(/''/g, "'");
  if (list === undefined || lists[list] === undefined) {
    return Promise.reject(new Error(`Unknown simulated SharePoint list in ${url}`));
  }
  const body: unknown = options !== undefined && options.body ? JSON.parse(options.body) : undefined;
  requests.push({ method, list, body, simulated: true });
  let result: unknown;
  if (method === 'POST') {
    const item: IPreviewItem = Object.assign({}, body as object, { Id: nextId++ }) as IPreviewItem;
    lists[list].push(item);
    result = item;
  } else {
    result = { value: lists[list].slice() };
  }
  return Promise.resolve({
    ok: true,
    status: method === 'POST' ? 201 : 200,
    json: (): Promise<unknown> => Promise.resolve(result),
    text: (): Promise<string> => Promise.resolve(JSON.stringify(result))
  });
}

const context: unknown = {
  pageContext: {
    user: { displayName: 'Local Preview (fictional)', email: 'preview@example.invalid' },
    web: { absoluteUrl: `${location.origin}/simulated-site`, permissions: { hasPermission: (): boolean => true } }
  },
  spHttpClient: {
    get: (url: string, _configuration: unknown, options?: { body?: string }): Promise<IPreviewResponse> => request('GET', url, options),
    post: (url: string, _configuration: unknown, options?: { body?: string }): Promise<IPreviewResponse> => request('POST', url, options)
  }
};

function BaseClientSideWebPart(this: { context: unknown; domElement: HTMLElement; properties: unknown }): void {
  const app: HTMLElement | null = document.getElementById('app');
  if (app === null) {
    throw new Error('The preview page has no #app element.');
  }
  this.context = context;
  this.domElement = app;
  this.properties = pendingProperties;
}
BaseClientSideWebPart.prototype.onInit = function onInit(): Promise<void> {
  return Promise.resolve();
};

const externals: { [name: string]: unknown } = {
  '@microsoft/sp-core-library': { Version: { parse: (value: string): { toString(): string } => ({ toString: (): string => value }) } },
  '@microsoft/sp-webpart-base': { BaseClientSideWebPart },
  '@microsoft/sp-page-context': { SPPermission: { manageWeb: 'simulated:manageWeb' } },
  '@microsoft/sp-http': { SPHttpClient: { configurations: { v1: { name: 'v1' } } } },
  '@microsoft/sp-property-pane': {
    PropertyPaneTextField: (targetProperty: string, properties: unknown): unknown => ({ targetProperty, properties })
  }
};

function resolveDependency(name: string): unknown {
  if (name === 'react') {
    return previewWindow.React;
  }
  if (name === 'react-dom') {
    return previewWindow.ReactDOM;
  }
  if (name === 'AiCoeFrontDoorWebPartStrings') {
    return strings;
  }
  if (externals[name] === undefined) {
    throw new Error(`Unsupported SharePoint Framework dependency: ${name}`);
  }
  return externals[name];
}

/** AMD shim: the strings chunk calls define([], factory); the bundle calls define(id, dependencies, factory). */
previewWindow.define = (first: string | string[], second: string[] | AmdFactory, third?: AmdFactory): void => {
  if (Array.isArray(first)) {
    strings = (second as unknown as () => { [key: string]: string })();
    return;
  }
  const dependencies: string[] = second as string[];
  const factory: AmdFactory = third as AmdFactory;
  webPartClass = factory.apply(undefined, dependencies.map(resolveDependency)).default;
};

previewWindow.FrontDoorPreview = {
  mode: 'OFFLINE_SIMULATION',
  requests,
  lists,
  mount: (properties: { [name: string]: unknown }): Promise<IPreviewWebPart> => {
    if (webPartClass === undefined) {
      return Promise.reject(new Error('Load the built bundle before mounting.'));
    }
    pendingProperties = Object.assign({}, properties);
    const webPart: IPreviewWebPart = new webPartClass();
    mounted = webPart;
    return webPart.onInit().then((): IPreviewWebPart => {
      webPart.render();
      return webPart;
    });
  },
  setOrganizationName: (name: string): void => {
    if (mounted === undefined) {
      throw new Error('Mount the web part first.');
    }
    mounted.properties.organizationName = name;
    mounted.render();
  }
};

export {};
