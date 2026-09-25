import * as React from 'react';
import * as ReactDom from 'react-dom';
import type { IReadonlyTheme } from '@microsoft/sp-component-base';
import { Version } from '@microsoft/sp-core-library';
import { SPHttpClient } from '@microsoft/sp-http';
import { SPPermission } from '@microsoft/sp-page-context';
import { PropertyPaneDropdown, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import type { IPropertyPaneConfiguration, IPropertyPaneField, IPropertyPaneGroup } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import * as strings from 'AiCoeFrontDoorWebPartStrings';

// Order matters: utilities first, then the hand-written rules, then the theme variables, then the page view modifiers,
// then their media queries. They must stay *.global.scss: the framework hashes the selectors of every other stylesheet name.
import './styles/tailwind.generated.global.scss';
import './styles/frontDoor.global.scss';
import './styles/theme.global.scss';
import './styles/pageViews.global.scss';
import './styles/appShell.global.scss';
import './styles/pageResponsive.global.scss';

import { createBranding } from './branding/branding';
import type { IBranding } from './branding/branding';
import { AiCoeFrontDoor } from './components/AiCoeFrontDoor';
import type { IAiCoeFrontDoorProps } from './components/AiCoeFrontDoor';
import { createPageViewSettings, FRONT_DOOR_VIEWS, isWorkflowView, PAGE_TARGET_PROPERTIES, PAGE_TARGETS, parseFrontDoorView, parsePieceLayout, PIECE_LAYOUTS } from './content/pageViews';
import type { FrontDoorView, IPageViewProperties, PageTarget, PieceLayout } from './content/pageViews';
import { parseContentUrl, parseOptionalContentUrl } from './content/pageContent';
import { PALETTE_KEYS, paletteCustomProperty, parsePaletteOverrides } from './content/palette';
import type { PaletteOverrides } from './content/palette';
import { parseRoleGroups } from './content/roles';
import { parseTelemetryProvider } from './content/telemetryTiles';
import type { IFrontDoorServices, IFrontDoorUser } from './context/FrontDoorContext';
import { createIdeaDraftService } from './services/draftService';
import type { IDraftHttpClient } from './services/draftService';
import { browserLocalStorage, LocalStorageDraftStore } from './services/draftStorage';
import { ServerDraftStore } from './services/serverDraftStore';
import type { IServerDraftPolicy } from './services/serverDraftStore';
import type { IDraftStore } from './services/draftStorage';
import { DurableSubmissionService } from './services/durableSubmissionService';
import { createFlowClientFactory } from './services/flowClient';
import { GovernanceService } from './services/GovernanceService';
import { MyWorkService } from './services/myWorkService';
import { browserNavigate } from './services/navigation';
import { PageContentService } from './services/pageContentService';
import { ProgramMeasuresService } from './services/programMeasuresService';
import { RoleResolver } from './services/roleResolver';
import { createToolPolicyEvaluator } from './services/toolPolicyEvaluator';
import type { IServiceContext } from './services/types';
import { UsageMetricsService } from './services/UsageMetricsService';
import { createDisabledLiveCoreWorkService, createSyntheticCoreWorkService } from './services/core/coreWorkService';
import type { ICoreWorkService } from './services/core/coreWorkService';
import { NativeCoreWorkService } from './services/core/nativeCoreWorkService';
import type { INativeCoreBinding } from './services/core/nativeCoreWorkService';
import { MemoryStorageBackend } from './services/marketing/artifactStore';
import type { IStorageBackend } from './services/marketing/artifactStore';
import { createBusinessMarketingServices, createDisabledLiveMarketingServices, createSyntheticMarketingServices } from './services/marketing/marketingServices';
import type { IMarketingServices, IMarketingBusinessBinding } from './services/marketing/marketingServices';

export interface IAiCoeFrontDoorWebPartProps extends IPageViewProperties {
  /** Organization name shown in the header, hero badge and summaries; blank keeps the wording neutral. */
  organizationName: string;
  /** Policy reference quoted on review requests; blank keeps the shipped wording in the legacy view and neutral wording in page views. */
  governanceReference: string;
  /** Name of the review system quoted in tool guidance; blank keeps the shipped name in the legacy view and neutral wording in page views. */
  reviewSystemName: string;
  /** Site group titles bound to the leader, operator and design-authority roles; blank binds none of them. */
  roleGroups: string;
  /** Colours of this organization as `key=#hex` pairs; blank sets no token and the shipped colours stand. */
  paletteOverrides: string;
  /** HTTP trigger URL of the AI draft flow; blank keeps the deterministic summaries. */
  draftServiceUrl: string;
  /** Server-owned, caller-secured list for unsubmitted business drafts. Blank fails closed. */
  draftListId?: string;
  /** Accepted server retention/access policy references; no secret values. */
  draftPolicyJson?: string;
  /** Non-secret, explicitly qualified v0.2.0 request/result binding. Empty leaves native work unavailable. */
  coreBindingJson?: string;
  /** Accepted Marketing extension ingress/result binding. Empty never selects the business runtime. */
  marketingBindingJson?: string;
  /** Usage feed shown by the telemetry strip: "claude" (default), "openai" (as shipped in 1.0.0.7) or "both". */
  telemetryProvider: string;
}

interface ICoreServices {
  governance: GovernanceService;
  usage: UsageMetricsService;
  myWork: MyWorkService;
  programMeasures: ProgramMeasuresService;

  flowClient: () => Promise<IDraftHttpClient>;
  user: IFrontDoorUser;
  /** Kept for the services that depend on a property, such as the page content reader. */
  serviceContext: IServiceContext;
}

export default class AiCoeFrontDoorWebPart extends BaseClientSideWebPart<IAiCoeFrontDoorWebPartProps> {
  private _isDarkTheme: boolean = false;
  private _core: ICoreServices | undefined;
  private _services: IFrontDoorServices | undefined;
  private _servicesKey: string | undefined;

  protected async onInit(): Promise<void> {
    await super.onInit();
    const serviceContext: IServiceContext = {
      siteUrl: this.context.pageContext.web.absoluteUrl,
      user: { displayName: this.context.pageContext.user.displayName, email: this.context.pageContext.user.email },
      client: this.context.spHttpClient,
      configuration: SPHttpClient.configurations.v1
    };
    // The list services are created once here; the shipped build rebuilt the telemetry service on every render.
    this._core = {
      governance: new GovernanceService(serviceContext),
      usage: new UsageMetricsService(serviceContext),
      myWork: new MyWorkService(serviceContext),
      programMeasures: new ProgramMeasuresService(serviceContext),

      flowClient: createFlowClientFactory(this.context.aadHttpClientFactory),
      user: serviceContext.user,
      serviceContext
    };
  }

  public render(): void {
    const core: ICoreServices = this._requireCore();
    this._applyPalette();
    const siteUrl: string = this.context.pageContext.web.absoluteUrl;
    // Every piece on its own page is a page view; only the whole-page legacy view keeps the shipped wording for
    // the blank governance reference and review system name (decision 21), so the parity suites hold.
    const branding: IBranding = createBranding(this.properties.organizationName, {
      governanceReference: this.properties.governanceReference,
      reviewSystemName: this.properties.reviewSystemName,
      pageView: parseFrontDoorView(this.properties.view) !== 'legacy'
    });
    const props: IAiCoeFrontDoorProps = {
      isDarkTheme: this._isDarkTheme,
      branding,
      siteUrl,
      user: core.user,
      isAdmin: this.context.pageContext.web.permissions.hasPermission(SPPermission.manageWeb),
      // A presentation choice only: it is not part of the services key, so switching never refetches.
      telemetryProvider: parseTelemetryProvider(this.properties.telemetryProvider),
      services: this._servicesFor(core, branding),
      // Also presentation: which piece this instance shows and where its links go.
      pageView: createPageViewSettings(this.properties, siteUrl),
      navigate: browserNavigate
    };
    ReactDom.render(React.createElement(AiCoeFrontDoor, props), this.domElement);
  }

  protected onThemeChanged(currentTheme: IReadonlyTheme | undefined): void {
    if (!currentTheme) {
      return;
    }
    this._isDarkTheme = !!currentTheme.isInverted;
    const { semanticColors } = currentTheme;
    if (semanticColors) {
      this.domElement.style.setProperty('--bodyText', semanticColors.bodyText || null);
      this.domElement.style.setProperty('--link', semanticColors.link || null);
      this.domElement.style.setProperty('--linkHovered', semanticColors.linkHovered || null);
    }
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  /** The layout and page link fields depend on the chosen view, so the pane is redrawn when it changes. */
  protected onPropertyPaneFieldChanged(propertyPath: string, oldValue: unknown, newValue: unknown): void {
    if (propertyPath === 'view' && oldValue !== newValue) {
      this.context.propertyPane?.refresh();
    }
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    const view: FrontDoorView = parseFrontDoorView(this.properties.view);
    const viewLabels: { [id in FrontDoorView]: string } = {
      legacy: strings.ViewOptionLegacy,
      app: strings.ViewOptionApp,
      home: strings.ViewOptionHome,
      idea: strings.ViewOptionIdea,
      toolCheck: strings.ViewOptionToolCheck,
      teamUsage: strings.ViewOptionTeamUsage,
      helpTraining: strings.ViewOptionHelpTraining,
      feedback: strings.ViewOptionFeedback,
      telemetry: strings.ViewOptionTelemetry,
      admin: strings.ViewOptionAdmin,
      page: strings.ViewOptionPage,
      outcome: strings.ViewOptionOutcome
    };
    const layoutLabels: { [id in PieceLayout]: string } = { wide: strings.LayoutOptionWide, narrow: strings.LayoutOptionNarrow };
    const pageLabels: { [target in PageTarget]: string } = {
      idea: strings.PageIdeaFieldLabel,
      toolCheck: strings.PageToolCheckFieldLabel,
      teamUsage: strings.PageTeamUsageFieldLabel,
      helpTraining: strings.PageHelpTrainingFieldLabel,
      feedback: strings.PageFeedbackFieldLabel,
      telemetry: strings.PageTelemetryFieldLabel,
      admin: strings.PageAdminFieldLabel,
      policy: strings.PagePolicyFieldLabel
    };

    const layoutFields: IPropertyPaneField<unknown>[] = [
      PropertyPaneDropdown('view', {
        label: strings.ViewFieldLabel,
        options: FRONT_DOOR_VIEWS.map((id: FrontDoorView): { key: string; text: string } => ({ key: id, text: viewLabels[id] })),
        selectedKey: view
      })
    ];
    if (view !== 'legacy') {
      layoutFields.push(
        PropertyPaneDropdown('layout', {
          label: strings.LayoutFieldLabel,
          options: PIECE_LAYOUTS.map((id: PieceLayout): { key: string; text: string } => ({ key: id, text: layoutLabels[id] })),
          selectedKey: parsePieceLayout(this.properties.layout)
        })
      );
    }
    if (isWorkflowView(view) || view === 'admin') {
      layoutFields.push(
        PropertyPaneTextField('returnUrl', {
          label: strings.ReturnUrlFieldLabel,
          description: strings.ReturnUrlFieldDescription,
          placeholder: 'SitePages/Requests.aspx'
        })
      );
    }

    const groups: IPropertyPaneGroup[] = [
      {
        groupName: strings.BrandingGroupName,
        groupFields: [
          PropertyPaneTextField('organizationName', {
            label: strings.OrganizationNameFieldLabel,
            description: strings.OrganizationNameFieldDescription,
            placeholder: 'Contoso'
          }),
          PropertyPaneTextField('governanceReference', {
            label: strings.GovernanceReferenceFieldLabel,
            description: strings.GovernanceReferenceFieldDescription,
            placeholder: 'Contoso AI policy, version 2.0, 1 March 2027'
          }),
          PropertyPaneTextField('reviewSystemName', {
            label: strings.ReviewSystemNameFieldLabel,
            description: strings.ReviewSystemNameFieldDescription,
            placeholder: 'Contoso Review Desk'
          }),
          PropertyPaneTextField('roleGroups', {
            label: strings.RoleGroupsFieldLabel,
            description: strings.RoleGroupsFieldDescription,
            placeholder: 'leader=AI CoE Leaders;operator=AI CoE Operators'
          }),
          PropertyPaneTextField('paletteOverrides', {
            label: strings.PaletteOverridesFieldLabel,
            description: strings.PaletteOverridesFieldDescription,
            placeholder: 'accent=#008B83;ink=#102B3D'
          })
        ]
      },
      {
        groupName: strings.DraftingGroupName,
        groupFields: [
          PropertyPaneTextField('draftServiceUrl', {
            label: strings.DraftServiceUrlFieldLabel,
            description: strings.DraftServiceUrlFieldDescription,
            placeholder: 'https://…/triggers/manual/paths/invoke?api-version=1'
          }),
          PropertyPaneTextField('draftListId', {
            label: 'Server draft list ID',
            description: 'Unsubmitted work stays on the server, never in browser storage. Blank disables saved business drafts.'
          }),
          PropertyPaneTextField('draftPolicyJson', {
            label: 'Qualified server draft policy (JSON)',
            multiline: true,
            description: 'Supply accepted access/retention references, retention period and qualification expiry. Server policy commissioning is required; this field does not enforce tenant retention.'
          }),
          PropertyPaneTextField('coreBindingJson', {
            label: 'Qualified native CORE binding (JSON)',
            multiline: true,
            description: 'Use the exact accepted v0.2.0 binding receipt and separate request/result GUIDs. Never enter secrets. A property cannot grant server permissions.'
          }),
          PropertyPaneTextField('marketingBindingJson', {
            label: 'Qualified business Marketing binding (JSON)',
            multiline: true,
            description: 'Requires the approved existing-writer runtime, separate ingress/results and actual qualification. No provider credentials belong in this web part.'
          })
        ]
      },
      {
        groupName: strings.TelemetryGroupName,
        groupFields: [
          PropertyPaneDropdown('telemetryProvider', {
            label: strings.TelemetryProviderFieldLabel,
            options: [
              { key: 'claude', text: strings.TelemetryProviderOptionClaude },
              { key: 'openai', text: strings.TelemetryProviderOptionOpenAi },
              { key: 'both', text: strings.TelemetryProviderOptionBoth }
            ],
            selectedKey: parseTelemetryProvider(this.properties.telemetryProvider)
          })
        ]
      },
      { groupName: strings.PageLayoutGroupName, groupFields: layoutFields }
    ];
    if (view === 'page') {
      groups.push({
        groupName: strings.PageContentGroupName,
        groupFields: [
          PropertyPaneTextField('pageKey', {
            label: strings.PageKeyFieldLabel,
            description: strings.PageKeyFieldDescription,
            placeholder: 'startHere'
          }),
          PropertyPaneTextField('contentUrl', {
            label: strings.ContentUrlFieldLabel,
            description: strings.ContentUrlFieldDescription,
            placeholder: 'SiteAssets/ai-coe-pages.json'
          })
        ]
      });
    }
    if (view === 'home') {
      groups.push({
        groupName: strings.PageLinksGroupName,
        // The eight tile targets, then the outcome record: a page link like the rest, without a tile of its own.
        groupFields: PAGE_TARGETS.map(
          (target: PageTarget): IPropertyPaneField<unknown> =>
            PropertyPaneTextField(PAGE_TARGET_PROPERTIES[target], {
              label: pageLabels[target],
              description: strings.PageLinkFieldDescription,
              placeholder: 'SitePages/Page-name.aspx'
            })
        ).concat([
          PropertyPaneTextField('pageOutcome', {
            label: strings.PageOutcomeFieldLabel,
            description: strings.PageLinkFieldDescription,
            placeholder: 'SitePages/Page-name.aspx'
          })
        ])
      });
    }

    return { pages: [{ header: { description: strings.PropertyPaneDescription }, groups }] };
  }

  /**
   * Sets the colours of this organization on this element as `--fd-*` custom properties, the way `onThemeChanged`
   * sets the theme colours. The rules inside read them with `var(--fd-x, <literal>)` and declare none of their own,
   * so a value set here reaches every rule; a key nobody set is removed and the fallback literal stands (decision 11).
   */
  private _applyPalette(): void {
    const palette: PaletteOverrides = parsePaletteOverrides(this.properties.paletteOverrides);
    for (const key of PALETTE_KEYS) {
      const name: string = paletteCustomProperty(key);
      const colour: string | undefined = palette[key];
      if (colour === undefined) {
        this.domElement.style.removeProperty(name);
      } else {
        this.domElement.style.setProperty(name, colour);
      }
    }
  }

  private _requireCore(): ICoreServices {
    if (this._core === undefined) {
      throw new Error('AiCoeFrontDoorWebPart.render was called before onInit completed.');
    }
    return this._core;
  }

  /** The service bundle handed to React; rebuilt only when a property it depends on changes. */
  private _servicesFor(core: ICoreServices, branding: IBranding): IFrontDoorServices {
    const draftServiceUrl: string = this.properties.draftServiceUrl ?? '';
    // Which site group stands for which role; the resolver reads the membership once per bundle.
    const roleGroups: string = this.properties.roleGroups ?? '';
    // A content page always has a document (the default path when blank); any other piece reads one only when its
    // property bag names it, so a form page shows the shared footer and an instance from before 1.0.0.12 reads nothing.
    const contentUrl: string | undefined =
      parseFrontDoorView(this.properties.view) === 'page' ? parseContentUrl(this.properties.contentUrl) : parseOptionalContentUrl(this.properties.contentUrl);
    // The tool policy evaluator reads the branding, so every branding input joins the key.
    const key: string = JSON.stringify([branding.organizationName, branding.governanceReference, branding.reviewSystemName, draftServiceUrl, contentUrl ?? null, roleGroups, this.properties.draftListId ?? '', this.properties.draftPolicyJson ?? '', this.properties.coreBindingJson ?? '', this.properties.marketingBindingJson ?? '', core.serviceContext.siteUrl, core.user.email]);
    if (this._services === undefined || this._servicesKey !== key) {
      const synthetic: boolean = this._isSyntheticHost(core.serviceContext.siteUrl);
      const draftStore: IDraftStore = synthetic
        ? new LocalStorageDraftStore(browserLocalStorage())
        : new ServerDraftStore(core.serviceContext, { listId: this.properties.draftListId ?? '', references: browserLocalStorage(), policy: this._draftPolicy() });
      this._services = {
        governance: synthetic ? core.governance : new DurableSubmissionService(core.governance, draftStore),
        usage: core.usage,
        myWork: core.myWork,
        programMeasures: core.programMeasures,
        // Reads the site groups once per bundle; the manageWeb answer is passed in at the call, never checked again.
        roles: new RoleResolver(core.serviceContext, parseRoleGroups(roleGroups)),
        draftStore,
        toolPolicyEvaluator: createToolPolicyEvaluator(branding),
        ideaDrafts: createIdeaDraftService(draftServiceUrl, core.flowClient),
        // Reads the document once per instance and document path; the page key alone never refetches.
        pageContent: contentUrl === undefined ? undefined : new PageContentService(core.serviceContext, contentUrl),
        marketing: this._marketingServices(core),
        coreWork: this._coreWork(core)
      };
      this._servicesKey = key;
    }
    return this._services;
  }

  /** Browser storage when it exists; an in-memory store otherwise. Synthetic records only. */
  private _storage(): IStorageBackend {
    const storage: Storage | undefined = browserLocalStorage();
    return storage !== undefined ? storage : new MemoryStorageBackend();
  }

  /**
   * The native adapter is selected only for a complete qualified split binding. The server remains authoritative.
   * Offline preview alone receives the labelled synthetic engine.
   */
  private _coreWork(core: ICoreServices): ICoreWorkService {
    if (this._isSyntheticHost(core.serviceContext.siteUrl)) {
      return createSyntheticCoreWorkService(core.user.email, { backend: this._storage() });
    }
    if (this.properties.coreBindingJson) {
      try {
        const binding: INativeCoreBinding = JSON.parse(this.properties.coreBindingJson) as INativeCoreBinding;
        return new NativeCoreWorkService(core.serviceContext, { binding, references: browserLocalStorage() });
      } catch { /* Malformed or incomplete bindings cannot activate a transport. */ }
    }
    return createDisabledLiveCoreWorkService();
  }

  private _isSyntheticHost(siteUrl: string): boolean {
    try {
      const url: URL = new URL(siteUrl);
      return ['127.0.0.1', 'localhost', '[::1]'].indexOf(url.hostname) >= 0 && url.pathname === '/simulated-site';
    } catch {
      return false;
    }
  }
  private _draftPolicy(): IServerDraftPolicy | undefined {
    try {
      const policy: IServerDraftPolicy = JSON.parse(this.properties.draftPolicyJson ?? '') as IServerDraftPolicy;
      return policy !== null && typeof policy === 'object' ? policy : undefined;
    } catch { return undefined; }
  }
  private _marketingServices(core: ICoreServices): IMarketingServices {
    if (this._isSyntheticHost(core.serviceContext.siteUrl)) { return createSyntheticMarketingServices(this._storage()); }
    try {
      const binding: IMarketingBusinessBinding = JSON.parse(this.properties.marketingBindingJson ?? '') as IMarketingBusinessBinding;
      const references: Storage | undefined = browserLocalStorage();
      if (!binding || binding.siteUrl !== core.serviceContext.siteUrl.replace(/\/$/, '') || references === undefined) { return createDisabledLiveMarketingServices(); }
      const context: IServiceContext = core.serviceContext;
      const bases: string[] = [binding.requestListId, binding.resultListId].map((id: string): string => `${binding.siteUrl}/_api/web/lists(guid'${id}')/items`);
      const headers = { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' };
      return createBusinessMarketingServices({
        binding, references,
        session: { actorId: core.user.email, tenantScope: binding.siteUrl, resolution: { resolution: 'unresolved', roles: [] } },
        pollAttempts: 4,
        wait: (): Promise<void> => new Promise((resolve): void => { setTimeout(resolve, 750); }),
        http: { request: async (method, url, body) => {
          if (!bases.some((base: string): boolean => url === base || url.startsWith(`${base}?`))) { throw new Error('Marketing URL is outside the bound ingress/results.'); }
          if (method === 'POST') {
            const identity = await context.client.get(`${binding.siteUrl}/_api/web/currentuser?$select=Id,Email`, context.configuration, { headers });
            const native = identity.ok ? await identity.json() as { Id?: unknown; Email?: unknown } : undefined;
            if (typeof native?.Id !== 'number' || native.Id < 1 || typeof native.Email !== 'string' || native.Email.toLowerCase() !== core.user.email.toLowerCase()) { throw new Error('Native caller changed; re-open the page.'); }
          }
          const response = method === 'POST'
            ? await context.client.post(url, context.configuration, { headers, body: JSON.stringify(body) })
            : await context.client.get(url, context.configuration, { headers });
          return { status: response.status, body: await response.json().catch((): null => null) };
        } }
      });
    } catch { return createDisabledLiveMarketingServices(); }
  }
}
