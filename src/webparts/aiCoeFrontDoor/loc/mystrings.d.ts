declare interface IAiCoeFrontDoorWebPartStrings {
  PropertyPaneDescription: string;
  BrandingGroupName: string;
  OrganizationNameFieldLabel: string;
  OrganizationNameFieldDescription: string;
  DraftingGroupName: string;
  DraftServiceUrlFieldLabel: string;
  DraftServiceUrlFieldDescription: string;
  TelemetryGroupName: string;
  TelemetryProviderFieldLabel: string;
  TelemetryProviderOptionClaude: string;
  TelemetryProviderOptionOpenAi: string;
  TelemetryProviderOptionBoth: string;
}

declare module 'AiCoeFrontDoorWebPartStrings' {
  const strings: IAiCoeFrontDoorWebPartStrings;
  export = strings;
}
