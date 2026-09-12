// Offline preview entry point; never shipped to SharePoint.
const SIMULATED_FLOW_URL = 'https://offline-preview.invalid/claude-draft';
const params = new URLSearchParams(location.search);
const organization = params.get('organization') ?? '';
const simulateDraft = params.get('draft') === 'simulated';
const input = document.getElementById('organization-name');
const draftToggle = document.getElementById('simulate-draft');
input.value = organization;
draftToggle.checked = simulateDraft;

window.FrontDoorPreview.mount({ organizationName: organization, draftServiceUrl: simulateDraft ? SIMULATED_FLOW_URL : '' }).catch((error) => {
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
