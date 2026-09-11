/** Small DOM spies for behaviour jsdom cannot observe on its own. */

export interface IDownloadSpy {
  /** File names handed to the anchor, in click order. */
  readonly names: string[];
  /** The blobs behind each download, in click order. */
  readonly blobs: Blob[];
  /** Text of the n-th downloaded blob. */
  text(index: number): Promise<string>;
  restore(): void;
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise<string>((resolve: (text: string) => void, reject: (reason: Error) => void): void => {
    const reader: FileReader = new FileReader();
    reader.onload = (): void => resolve(String(reader.result ?? ''));
    reader.onerror = (): void => reject(new Error('Could not read the downloaded blob.'));
    reader.readAsText(blob);
  });
}

/** Captures anchor downloads (blob URL + `download` attribute) triggered by the summary panels. */
export function spyOnDownloads(): IDownloadSpy {
  const names: string[] = [];
  const blobs: Blob[] = [];
  const created: Blob[] = [];
  const originalCreate: typeof URL.createObjectURL = URL.createObjectURL;
  const originalRevoke: typeof URL.revokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = (blob: Blob): string => {
    created.push(blob);
    return `blob:test-${created.length}`;
  };
  URL.revokeObjectURL = (): void => undefined;
  const click: jest.SpyInstance = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement): void {
    names.push(this.download);
    blobs.push(created[Number(this.href.replace('blob:test-', '')) - 1]);
  });
  return {
    names,
    blobs,
    text: (index: number): Promise<string> => readBlobText(blobs[index]),
    restore: (): void => {
      click.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  };
}
