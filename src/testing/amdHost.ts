/**
 * Loads a built web part bundle (the AMD `define(...)` output of the SharePoint Framework build, or
 * the original 1.0.0.7 bundle from the recovered package) into the Jest DOM with a simulated SPFx
 * host: fake `BaseClientSideWebPart`, page context, permissions and an in-memory SharePoint list
 * store. Nothing here talks to a tenant.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { createFakeListClient, InMemoryListStore } from './listStore';

export const LIST_TITLES: readonly string[] = ['AI CoE Pilot Intakes', 'AI CoE Use Cases', 'AI CoE Decisions', 'AI Usage Daily', 'AI CoE Incidents'];
export const MANAGE_WEB_PERMISSION: string = 'simulated:manageWeb';

export interface IHostUser {
  displayName: string;
  email: string;
}

export interface IFlowReply {
  status: number;
  body: string;
}

export interface IFlowRequest {
  url: string;
  headers: { [name: string]: string };
  body: unknown;
}

export interface IAmdHostOptions {
  siteUrl?: string;
  user?: IHostUser;
  isAdmin?: boolean;
  /** Web part property bag (`this.properties`). */
  properties?: { [name: string]: unknown };
  store?: InMemoryListStore;
  /** Files readable through the REST API, keyed by server-relative path (for example the page content document). */
  files?: { [serverRelativePath: string]: string };
  /** Simulated AI draft flow behind the Entra-authenticated client; answers 404 when absent. */
  draftFlow?: (request: unknown) => IFlowReply;
  /** The context's property pane accessor; absent by default, like a page whose pane is closed. */
  propertyPane?: { refresh(): void };
}

export interface IThemeLike {
  isInverted?: boolean;
  semanticColors?: { bodyText?: string; link?: string; linkHovered?: string };
}

export interface IPropertyPaneFieldLike {
  targetProperty: string;
  properties: { label?: string; description?: string; placeholder?: string; options?: { key: string; text: string }[]; selectedKey?: string };
}

export interface IPropertyPaneConfigurationLike {
  pages: { header: { description: string }; groups: { groupName: string; groupFields: IPropertyPaneFieldLike[] }[] }[];
}

/** The surface of a web part instance the tests drive; mirrors BaseClientSideWebPart. */
export interface IHostedWebPart {
  onInit(): Promise<void>;
  render(): void;
  onDispose(): void;
  onThemeChanged(theme: IThemeLike | undefined): void;
  getPropertyPaneConfiguration(): IPropertyPaneConfigurationLike;
  onPropertyPaneFieldChanged(propertyPath: string, oldValue: unknown, newValue: unknown): void;
  readonly dataVersion: { toString(): string };
  domElement: HTMLElement;
  properties: { [name: string]: unknown };
}

export interface IHostedInstance {
  webPart: IHostedWebPart;
  store: InMemoryListStore;
  /** Permissions the web part asked about, in order. */
  permissionChecks: unknown[];
  /** Resource endpoints for which the web part requested an Entra-authenticated client. */
  flowResources: string[];
  /** Requests posted through that client, oldest first. */
  flowRequests: IFlowRequest[];
  /** Unmounts the web part and removes its element from the document. */
  dispose(): void;
}

export interface IWebPartBundle {
  /** The AMD module id, e.g. "cf2e5904-0703-4fe4-ae5a-ec012d6fa689_1.0.0". */
  id: string;
  /** External module names the bundle expects the framework to provide. */
  dependencies: string[];
  /** Instantiates the web part from a fresh evaluation of the module factory. */
  create(options?: IAmdHostOptions): IHostedInstance;
}

type AmdFactory = (...modules: unknown[]) => { default: new () => IHostedWebPart };

interface ICapturedDefinition {
  id: string;
  dependencies: string[];
  factory: AmdFactory;
}

interface IBaseFields {
  context: unknown;
  domElement: HTMLElement;
  properties: { [name: string]: unknown };
}

export const DEFAULT_SITE_URL: string = 'https://contoso.sharepoint.com/sites/ai';
export const DEFAULT_USER: IHostUser = { displayName: 'Pat Example', email: 'pat@contoso.com' };

/** Runs a `define(...)` script and returns what it registered. */
function captureDefinition(code: string): ICapturedDefinition {
  let captured: ICapturedDefinition | undefined;
  const define = (id: string, dependencies: string[], factory: AmdFactory): void => {
    captured = { id, dependencies, factory };
  };
  // eslint-disable-next-line no-new-func -- executing the built bundle is the purpose of this host
  new Function('define', code)(define);
  if (captured === undefined) {
    throw new Error('The bundle did not call define(id, dependencies, factory).');
  }
  return captured;
}

/** Evaluates a localized-strings chunk (`define([], function () { return {...}; })`). */
export function loadStringsChunk(filePath: string): { [key: string]: string } {
  let strings: { [key: string]: string } | undefined;
  const define = (dependencies: string[], factory: () => { [key: string]: string }): void => {
    strings = factory();
  };
  // eslint-disable-next-line no-new-func -- executing the built strings chunk is the purpose of this host
  new Function('define', fs.readFileSync(filePath, 'utf8'))(define);
  if (strings === undefined) {
    throw new Error(`${filePath} did not define a strings module.`);
  }
  return strings;
}

function createBaseClass(fields: IBaseFields): new () => IHostedWebPart {
  // An ES5-style constructor: the bundles extend it with tslib's __extends and call it via .apply().
  function BaseClientSideWebPart(this: IBaseFields): void {
    this.context = fields.context;
    this.domElement = fields.domElement;
    this.properties = fields.properties;
  }
  BaseClientSideWebPart.prototype.onInit = function onInit(): Promise<void> {
    return Promise.resolve();
  };
  return BaseClientSideWebPart as unknown as new () => IHostedWebPart;
}

/**
 * Parses a bundle once; every `create()` re-runs the module factory so module-level state (such as
 * the original bundle's last-submission variable) starts fresh per instance.
 */
export function loadWebPartBundle(bundlePath: string, stringsPath?: string): IWebPartBundle {
  const definition: ICapturedDefinition = captureDefinition(fs.readFileSync(bundlePath, 'utf8'));
  const strings: { [key: string]: string } = stringsPath === undefined ? {} : loadStringsChunk(stringsPath);

  return {
    id: definition.id,
    dependencies: definition.dependencies.slice(),
    create: (options: IAmdHostOptions = {}): IHostedInstance => {
      const store: InMemoryListStore = options.store ?? new InMemoryListStore(LIST_TITLES.slice());
      const files: { [serverRelativePath: string]: string } = options.files ?? {};
      for (const serverRelativePath of Object.keys(files)) {
        store.seedFile(serverRelativePath, files[serverRelativePath]);
      }
      const permissionChecks: unknown[] = [];
      const flowResources: string[] = [];
      const flowRequests: IFlowRequest[] = [];
      const domElement: HTMLElement = document.createElement('div');
      document.body.appendChild(domElement);
      const aadHttpClient: unknown = {
        post: (url: string, _configuration: unknown, requestOptions: { headers?: { [name: string]: string }; body?: string }): Promise<unknown> => {
          const body: unknown = requestOptions.body === undefined ? undefined : JSON.parse(requestOptions.body);
          flowRequests.push({ url, headers: requestOptions.headers ?? {}, body });
          const reply: IFlowReply = options.draftFlow === undefined ? { status: 404, body: '' } : options.draftFlow(body);
          return Promise.resolve({
            ok: reply.status >= 200 && reply.status < 300,
            status: reply.status,
            text: (): Promise<string> => Promise.resolve(reply.body),
            json: (): Promise<unknown> => Promise.resolve(JSON.parse(reply.body))
          });
        }
      };
      const context: unknown = {
        pageContext: {
          user: options.user ?? DEFAULT_USER,
          web: {
            absoluteUrl: options.siteUrl ?? DEFAULT_SITE_URL,
            permissions: {
              hasPermission: (permission: unknown): boolean => {
                permissionChecks.push(permission);
                return options.isAdmin === true;
              }
            }
          }
        },
        propertyPane: options.propertyPane,
        spHttpClient: createFakeListClient(store),
        aadHttpClientFactory: {
          getClient: (resource: string): Promise<unknown> => {
            flowResources.push(resource);
            return Promise.resolve(aadHttpClient);
          }
        }
      };
      const externals: { [name: string]: unknown } = {
        react: React,
        'react-dom': ReactDOM,
        '@microsoft/sp-core-library': { Version: { parse: (value: string): { toString(): string } => ({ toString: (): string => value }) } },
        '@microsoft/sp-webpart-base': { BaseClientSideWebPart: createBaseClass({ context, domElement, properties: { ...options.properties } }) },
        '@microsoft/sp-page-context': { SPPermission: { manageWeb: MANAGE_WEB_PERMISSION } },
        '@microsoft/sp-http': { SPHttpClient: { configurations: { v1: { name: 'v1' } } }, AadHttpClient: { configurations: { v1: { name: 'aad-v1' } } } },
        '@microsoft/sp-property-pane': {
          PropertyPaneTextField: (targetProperty: string, properties: IPropertyPaneFieldLike['properties']): IPropertyPaneFieldLike => ({ targetProperty, properties }),
          PropertyPaneDropdown: (targetProperty: string, properties: IPropertyPaneFieldLike['properties']): IPropertyPaneFieldLike => ({ targetProperty, properties })
        },
        AiCoeFrontDoorWebPartStrings: strings
      };
      const modules: unknown[] = definition.dependencies.map((name: string): unknown => {
        if (!(name in externals)) {
          throw new Error(`The bundle depends on "${name}", which the simulated host does not provide.`);
        }
        return externals[name];
      });
      const WebPart: new () => IHostedWebPart = definition.factory(...modules).default;
      const webPart: IHostedWebPart = new WebPart();
      return {
        webPart,
        store,
        permissionChecks,
        flowResources,
        flowRequests,
        dispose: (): void => {
          webPart.onDispose();
          domElement.remove();
        }
      };
    }
  };
}

/** The dev or production bundle written last by the SharePoint Framework build. */
export function newestDistBundle(): string {
  const dist: string = path.resolve(process.cwd(), 'dist');
  const candidates: string[] = fs
    .readdirSync(dist)
    .filter((name: string): boolean => /^ai-coe-front-door-web-part.*\.js$/.test(name))
    .map((name: string): string => path.join(dist, name));
  if (candidates.length === 0) {
    throw new Error('No web part bundle in dist/; run the build first.');
  }
  return candidates.sort((a: string, b: string): number => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

/** The localized strings chunk matching the newest bundle (dev builds omit the hash). */
export function newestStringsChunk(): string {
  const dist: string = path.resolve(process.cwd(), 'dist');
  const candidates: string[] = fs
    .readdirSync(dist)
    .filter((name: string): boolean => /^AiCoeFrontDoorWebPartStrings_en-us.*\.js$/.test(name))
    .map((name: string): string => path.join(dist, name));
  if (candidates.length === 0) {
    throw new Error('No strings chunk in dist/; run the build first.');
  }
  return candidates.sort((a: string, b: string): number => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

/** The 1.0.0.7 bundle extracted from the shipped package. */
export function originalBundle(): string {
  const assets: string = path.resolve(process.cwd(), 'recovered/package/ClientSideAssets');
  const candidates: string[] = fs.readdirSync(assets).filter((name: string): boolean => /^ai-coe-front-door-web-part_[0-9a-f]+\.js$/.test(name));
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one original bundle in ${assets}, found ${candidates.length}.`);
  }
  return path.join(assets, candidates[0]);
}
