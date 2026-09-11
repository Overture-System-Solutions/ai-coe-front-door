// New offline-preview entry point; never shipped to SharePoint.
window.RecoveryPreview.mount().catch(error => {
  document.getElementById('preview-error').textContent = 'Local preview failed: ' + error.message;
  console.error(error);
});
