/** Offers `text` as a plain-text download named `filename`; failures are silent, as shipped. */
export function downloadTextFile(text: string, filename: string): void {
  try {
    const blob: Blob = new Blob([text], { type: 'text/plain' });
    const url: string = URL.createObjectURL(blob);
    const anchor: HTMLAnchorElement = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  } catch {
    // The copy button and the on-screen summary remain available.
  }
}
