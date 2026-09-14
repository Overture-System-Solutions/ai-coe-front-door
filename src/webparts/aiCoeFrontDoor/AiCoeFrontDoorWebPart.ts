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

// Order matters: utilities first, then the hand-written rules, then the theme variables, then the page view modifiers.
// They must stay *.global.scss: the framework hashes the selectors of every other stylesheet name.
import './styles/tailwind.generated.global.scss';
import './styles/frontDoor.global.scss';
import './styles/theme.global.scss';
import './styles/pageViews.global.scss';

import { createBranding } from './branding/branding';
import type { IBranding } from './branding/branding';
import { AiCoeFrontDoor } from './components/AiCoeFrontDoor';
import type { IAiCoeFrontDoorProps } from './components/AiCoeFrontDoor';
import { createPageViewSettings, FRONT_DOOR_VIEWS, isWorkflowView, PAGE_TARGET_PROPERTIES, PAGE_TARGETS, parseFrontDoorView, parsePieceLayout, PIECE_LAYOUTS } from './content/pageViews';
import type { FrontDoorView, IPageViewProperties, PageTarget, PieceLayout } from './content/pageViews';
import { parseTelemetryProvider } from './content/telemetryTiles';
import type { IFrontDoorServices, IFrontDoorUser } from './context/FrontDoorContext';
import { createIdeaDraftService } from './services/draftService';
import type { IDraftHttpClient } from './services/draftService';
import { browserLocalStorage, LocalStorageDraftStore } from './services/draftStorage';
import { createFlowClientFactory } from './services/flowClient';
import { GovernanceService } from './services/GovernanceService';
import { browserNavigate } from './services/navigation';
import { createToolPolicyEvaluator } from './services/toolPolicyEvaluator';
import type { IServiceContext } from './services/types';
import { UsageMetricsService } from './services/UsageMetricsService';

export interface IAiCoeFrontDoorWebPartProps extends IPageViewProperties {
  /** Organization name shown in the header, hero badge and summaries; blank keeps the wording neutral. */
  organizationName: string;
  /** HTTP trigger URL of the Claude draft flow; blank keeps the deterministic summaries. */
  draftServiceUrl: string;
  /** Usage feed shown by the telemetry strip: "claude" (default), "openai" (as shipped in 1.0.0.7) or "both". */
  telemetryProvider: string;
}

interface ICoreServices {
  governance: GovernanceService;
  usage: UsageMetricsService;
  draftStore: LocalStorageDraftStore;
  flowClient: () => Promise<IDraftHttpClient>;
  user: IFrontDoorUser;
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
    // Both services are created once here; the shipped build rebuilt the telemetry service on every render.
    this._core = {
      governance: new GovernanceService(serviceContext),
      usage: new UsageMetricsService(serviceContext),
      draftStore: new LocalStorageDraftStore(browserLocalStorage()),
      flowClient: createFlowClientFactory(this.context.aadHttpClientFactory),
      user: serviceContext.user
    };
  }

  public render(): void {
    const core: ICoreServices = this._requireCore();
    const branding: IBranding = createBranding(this.properties.organizationName);
    const siteUrl: string = this.context.pageContext.web.absoluteUrl;
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
      home: strings.ViewOptionHome,
      idea: strings.ViewOptionIdea,
      toolCheck: strings.ViewOptionToolCheck,
      teamUsage: strings.ViewOptionTeamUsage,
      helpTraining: strings.ViewOptionHelpTraining,
      feedback: strings.ViewOptionFeedback,
      telemetry: strings.ViewOptionTelemetry,
      admin: strings.ViewOptionAdmin
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
    if (view === 'home') {
      groups.push({
        groupName: strings.PageLinksGroupName,
        groupFields: PAGE_TARGETS.map(
          (target: PageTarget): IPropertyPaneField<unknown> =>
            PropertyPaneTextField(PAGE_TARGET_PROPERTIES[target], {
              label: pageLabels[target],
              description: strings.PageLinkFieldDescription,
              placeholder: 'SitePages/Page-name.aspx'
            })
        )
      });
    }

    return { pages: [{ header: { description: strings.PropertyPaneDescription }, groups }] };
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
    const key: string = JSON.stringify([branding.organizationName, draftServiceUrl]);
    if (this._services === undefined || this._servicesKey !== key) {
      this._services = {
        governance: core.governance,
        usage: core.usage,
        draftStore: core.draftStore,
        toolPolicyEvaluator: createToolPolicyEvaluator(branding),
        ideaDrafts: createIdeaDraftService(draftServiceUrl, core.flowClient)
      };
      this._servicesKey = key;
    }
    return this._services;
  }
}
