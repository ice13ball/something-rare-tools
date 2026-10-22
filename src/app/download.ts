// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Blob downloads. Nothing goes into the page URL, and every object URL is revoked after the click.

/** A name safe on every file system: path parts dropped, only [A-Za-z0-9._-], at most 80 characters, never empty. */
export function safeFileName(name: string): string {
  const last = name.split(/[\\/]/).pop() ?? '';
  const ascii = last
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+|_+$/g, '')
    .slice(0, 80);
  return ascii === '' || /^\.+$/.test(ascii) ? 'dataset' : ascii;
}

/** File name stem of a dataset label ("book.xlsx (Sheet 1)" -> "book_Sheet_1"): the data extension is dropped. */
export function fileBase(label: string): string {
  return safeFileName(label.replace(/\.(csv|tsv|txt|tab|xlsx|xls)(?=\s|\)|$)/gi, ''));
}

export interface DownloadDeps {
  doc: Document;
  urls: { createObjectURL(b: Blob): string; revokeObjectURL(u: string): void };
  schedule: (fn: () => void) => void;
}

const defaults = (): DownloadDeps => ({ doc: document, urls: URL, schedule: (fn) => void setTimeout(fn, 1000) });

/** Offers `text` as a file download. The object URL is revoked shortly after the click (a click needs the URL alive). */
export function downloadText(text: string, fileName: string, mime: string, deps: DownloadDeps = defaults()): void {
  const url = deps.urls.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
  const a = deps.doc.createElement('a');
  a.href = url;
  a.download = safeFileName(fileName);
  a.rel = 'noopener';
  deps.doc.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    deps.schedule(() => deps.urls.revokeObjectURL(url));
  }
}

/** Offers a Blob (the stored fix list) as a file download: no copy into a string, the object URL is revoked shortly after the click. */
export function downloadBlob(blob: Blob, fileName: string, deps: DownloadDeps = defaults()): void {
  const url = deps.urls.createObjectURL(blob);
  const a = deps.doc.createElement('a');
  a.href = url;
  a.download = safeFileName(fileName);
  a.rel = 'noopener';
  deps.doc.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    deps.schedule(() => deps.urls.revokeObjectURL(url));
  }
}
