import * as React from 'react';
import * as ReactDom from 'react-dom';
import type { IReadonlyTheme } from '@microsoft/sp-component-base';
import { Version } from '@microsoft/sp-core-library';
import { SPHttpClient } from '@microsoft/sp-http';
import { SPPermission } from '@microsoft/sp-page-context';
import { PropertyPaneTextField } from '@microsoft/sp-property-pane';
import type { IPropertyPaneConfiguration } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import * as strings from 'AiCoeFrontDoorWebPartStrings';

// Order matters: utilities first, then the hand-written rules, then the theme variables.
// They must stay *.global.scss: the framework hashes the selectors of every other stylesheet name.
import './styles/tailwind.generated.global.scss';
import './styles/frontDoor.global.scss';
import './styles/theme.global.scss';

import { createBranding } from './branding/branding';
import type { IBranding } from './branding/branding';
import { AiCoeFrontDoor } from './components/AiCoeFrontDoor';
import type { IAiCoeFrontDoorProps } from './components/AiCoeFrontDoor';
import type { IFrontDoorServices, IFrontDoorUser } from './context/FrontDoorContext';
import { browserLocalStorage, LocalStorageDraftStore } from './services/draftStorage';
import { GovernanceService } from './services/GovernanceService';
import { createToolPolicyEvaluator } from './services/toolPolicyEvaluator';
import type { IServiceContext } from './services/types';
import { UsageMetricsService } from './services/UsageMetricsService';

export interface IAiCoeFrontDoorWebPartProps {
  /** Organization name shown in the header, hero badge and summaries; blank keeps the wording neutral. */
  organizationName: string;
}

interface ICoreServices {
  governance: GovernanceService;
  usage: UsageMetricsService;
  draftStore: LocalStorageDraftStore;
  user: IFrontDoorUser;
}

export default class AiCoeFrontDoorWebPart extends BaseClientSideWebPart<IAiCoeFrontDoorWebPartProps> {
  private _isDarkTheme: boolean = false;
  private _core: ICoreServices | undefined;
  private _services: IFrontDoorServices | undefined;
  private _servicesOrganization: string | undefined;

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
      user: serviceContext.user
    };
  }

  public render(): void {
    const core: ICoreServices = this._requireCore();
    const branding: IBranding = createBranding(this.properties.organizationName);
    const props: IAiCoeFrontDoorProps = {
      isDarkTheme: this._isDarkTheme,
      branding,
      siteUrl: this.context.pageContext.web.absoluteUrl,
      user: core.user,
      isAdmin: this.context.pageContext.web.permissions.hasPermission(SPPermission.manageWeb),
      services: this._servicesFor(core, branding)
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

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: strings.PropertyPaneDescription },
          groups: [
            {
              groupName: strings.BrandingGroupName,
              groupFields: [
                PropertyPaneTextField('organizationName', {
                  label: strings.OrganizationNameFieldLabel,
                  description: strings.OrganizationNameFieldDescription,
                  placeholder: 'Contoso'
                })
              ]
            }
          ]
        }
      ]
    };
  }

  private _requireCore(): ICoreServices {
    if (this._core === undefined) {
      throw new Error('AiCoeFrontDoorWebPart.render was called before onInit completed.');
    }
    return this._core;
  }

  /** The service bundle handed to React; only the policy evaluator depends on the organization name. */
  private _servicesFor(core: ICoreServices, branding: IBranding): IFrontDoorServices {
    if (this._services === undefined || this._servicesOrganization !== branding.organizationName) {
      this._services = {
        governance: core.governance,
        usage: core.usage,
        draftStore: core.draftStore,
        toolPolicyEvaluator: createToolPolicyEvaluator(branding)
      };
      this._servicesOrganization = branding.organizationName;
    }
    return this._services;
  }
}
