// Offline preview entry point; never shipped to SharePoint.
const params = new URLSearchParams(location.search);
const organization = params.get('organization') ?? '';
const input = document.getElementById('organization-name');
input.value = organization;

window.FrontDoorPreview.mount({ organizationName: organization }).catch((error) => {
  document.getElementById('preview-error').textContent = `Local preview failed: ${error.message}`;
  console.error(error);
});

document.getElementById('organization-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = input.value.trim();
  const url = new URL(location.href);
  if (name) {
    url.searchParams.set('organization', name);
  } else {
    url.searchParams.delete('organization');
  }
  history.replaceState(null, '', url);
  window.FrontDoorPreview.setOrganizationName(name);
});
