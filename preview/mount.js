// Offline preview entry point; never shipped to SharePoint.
const SIMULATED_FLOW_URL = 'https://offline-preview.invalid/claude-draft';
const TELEMETRY_PROVIDERS = ['claude', 'openai', 'both'];
const VIEWS = ['legacy', 'home', 'idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'telemetry', 'admin', 'page'];
const LAYOUTS = ['wide', 'narrow'];
// Pages of the simulated content document the host serves as SiteAssets/ai-coe-pages.json.
const PAGE_KEYS = ['startHere', 'learn', 'useAi', 'requests', 'prompts', 'status'];
// The home tiles link to other pages; offline, every other page is this page showing another piece.
const PAGE_PROPERTIES = {
  pageIdea: 'idea',
  pageToolCheck: 'toolCheck',
  pageTeamUsage: 'teamUsage',
  pageHelpTraining: 'helpTraining',
  pageFeedback: 'feedback',
  pageTelemetry: 'telemetry',
  pageAdmin: 'admin'
};
const params = new URLSearchParams(location.search);
const organization = params.get('organization') ?? '';
const simulateDraft = params.get('draft') === 'simulated';
const requestedProvider = (params.get('provider') ?? '').toLowerCase();
const provider = TELEMETRY_PROVIDERS.includes(requestedProvider) ? requestedProvider : 'claude';
const requestedPage = params.get('page') ?? '';
const pageKey = PAGE_KEYS.includes(requestedPage) ? requestedPage : 'startHere';
const requestedView = params.get('view') ?? '';
// "?page=learn" alone implies the content page view.
const view = VIEWS.includes(requestedView) ? requestedView : requestedPage ? 'page' : 'legacy';
const requestedLayout = params.get('layout') ?? '';
const layout = LAYOUTS.includes(requestedLayout) ? requestedLayout : 'wide';
const width = Number(params.get('width') ?? 0);
const input = document.getElementById('organization-name');
const draftToggle = document.getElementById('simulate-draft');
const providerSelect = document.getElementById('telemetry-provider');
const viewSelect = document.getElementById('view');
const layoutSelect = document.getElementById('layout');
const pageSelect = document.getElementById('page-key');
input.value = organization;
draftToggle.checked = simulateDraft;
providerSelect.value = provider;
viewSelect.value = view;
layoutSelect.value = layout;
pageSelect.value = pageKey;
if (width > 0) {
  // Approximates a section column so the narrow layout can be eyeballed.
  document.getElementById('app').style.maxWidth = `${width}px`;
}

/** This page showing another piece, keeping the other query parameters. */
function viewLink(target) {
  const url = new URL(location.href);
  url.searchParams.set('view', target);
  return `${url.pathname}${url.search}`;
}

const properties = {
  organizationName: organization,
  draftServiceUrl: simulateDraft ? SIMULATED_FLOW_URL : '',
  telemetryProvider: provider,
  view,
  layout,
  pageKey,
  contentUrl: 'SiteAssets/ai-coe-pages.json',
  returnUrl: viewLink('home'),
  // Blank keeps the policy library link of the simulated site, which the preview leaves inert.
  pagePolicy: ''
};
for (const [name, target] of Object.entries(PAGE_PROPERTIES)) {
  properties[name] = viewLink(target);
}

window.FrontDoorPreview.mount(properties).catch((error) => {
  document.getElementById('preview-error').textContent = `Local preview failed: ${error.message}`;
  console.error(error);
});

function syncUrl() {
  const url = new URL(location.href);
  const name = input.value.trim();
  if (name) {
    url.searchParams.set('organization', name);
  } else {
    url.searchParams.delete('organization');
  }
  if (draftToggle.checked) {
    url.searchParams.set('draft', 'simulated');
  } else {
    url.searchParams.delete('draft');
  }
  if (providerSelect.value === 'claude') {
    url.searchParams.delete('provider');
  } else {
    url.searchParams.set('provider', providerSelect.value);
  }
  if (viewSelect.value === 'legacy') {
    url.searchParams.delete('view');
  } else {
    url.searchParams.set('view', viewSelect.value);
  }
  if (layoutSelect.value === 'wide') {
    url.searchParams.delete('layout');
  } else {
    url.searchParams.set('layout', layoutSelect.value);
  }
  if (viewSelect.value === 'page') {
    url.searchParams.set('page', pageSelect.value);
  } else {
    url.searchParams.delete('page');
  }
  history.replaceState(null, '', url);
}

document.getElementById('organization-form').addEventListener('submit', (event) => {
  event.preventDefault();
  syncUrl();
  window.FrontDoorPreview.setOrganizationName(input.value.trim());
});

draftToggle.addEventListener('change', () => {
  syncUrl();
  window.FrontDoorPreview.setDraftServiceUrl(draftToggle.checked ? SIMULATED_FLOW_URL : '');
});

providerSelect.addEventListener('change', () => {
  syncUrl();
  window.FrontDoorPreview.setTelemetryProvider(providerSelect.value);
});

viewSelect.addEventListener('change', () => {
  syncUrl();
  window.FrontDoorPreview.setView(viewSelect.value);
});

layoutSelect.addEventListener('change', () => {
  syncUrl();
  window.FrontDoorPreview.setLayout(layoutSelect.value);
});

pageSelect.addEventListener('change', () => {
  if (viewSelect.value !== 'page') {
    viewSelect.value = 'page';
    window.FrontDoorPreview.setView('page');
  }
  syncUrl();
  window.FrontDoorPreview.setPageKey(pageSelect.value);
});
