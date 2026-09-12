// Offline preview entry point; never shipped to SharePoint.
const SIMULATED_FLOW_URL = 'https://offline-preview.invalid/claude-draft';
const TELEMETRY_PROVIDERS = ['claude', 'openai', 'both'];
const params = new URLSearchParams(location.search);
const organization = params.get('organization') ?? '';
const simulateDraft = params.get('draft') === 'simulated';
const requestedProvider = (params.get('provider') ?? '').toLowerCase();
const provider = TELEMETRY_PROVIDERS.includes(requestedProvider) ? requestedProvider : 'claude';
const input = document.getElementById('organization-name');
const draftToggle = document.getElementById('simulate-draft');
const providerSelect = document.getElementById('telemetry-provider');
input.value = organization;
draftToggle.checked = simulateDraft;
providerSelect.value = provider;

window.FrontDoorPreview.mount({ organizationName: organization, draftServiceUrl: simulateDraft ? SIMULATED_FLOW_URL : '', telemetryProvider: provider }).catch((error) => {
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
