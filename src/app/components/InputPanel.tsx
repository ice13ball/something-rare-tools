// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useId, useState } from 'react';
import { t, useLang } from '../i18n';
import { FieldLabel, InfoTip } from './InfoTip';
import { ACCEPTED_EXTENSIONS, type CheckInput, type DownloadMode } from '../types';

export interface InputPanelProps {
  mode: DownloadMode;
  onSubmit: (input: CheckInput) => void;
  disabled?: boolean;
  /** Rendered right after the link field: the download mode only matters for links, dropped files never leave the computer. */
  modeSwitch?: React.ReactNode;
}

function accepted(f: File): boolean {
  const name = f.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

const sameFile = (a: File, b: File): boolean => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/**
 * Drop zone + link/DOI field + Check button. Files and the link stay in component state and go to
 * onSubmit; they are never written to the URL (the form never navigates: submit is always prevented).
 */
export function InputPanel({ mode, onSubmit, disabled, modeSwitch }: InputPanelProps): React.ReactElement {
  useLang();
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [link, setLink] = useState('');
  const [empty, setEmpty] = useState(false);
  const [dragging, setDragging] = useState(false);
  const linkId = useId();

  const add = (list: ArrayLike<File> | null | undefined): void => {
    if (!list) return;
    const incoming = Array.from(list);
    const ok = incoming.filter(accepted);
    setRejected(incoming.filter((f) => !accepted(f)).map((f) => f.name));
    if (ok.length > 0) setEmpty(false);
    setFiles((prev) => [...prev, ...ok.filter((f) => !prev.some((p) => sameFile(p, f)))]);
  };

  const submit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = link.trim();
    if (files.length === 0 && trimmed === '') {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    onSubmit(trimmed === '' ? { files, mode } : { files, link: trimmed, mode });
  };

  return (
    <form className="input-panel" onSubmit={submit} noValidate>
      <h2>{t('input.heading')}</h2>
      {/* the drag handlers stand on the wrapper, so a file dropped on the ⓘ beside the zone is taken too and the browser never opens it */}
      <div
        className="dropzone-wrap"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer?.files);
        }}
      >
      <label className={dragging ? 'dropzone dragging' : 'dropzone'}>
        <strong>{t('input.drop')}</strong>
        <span className="muted">{t('input.dropHint')}</span>
        <input
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={(e) => {
            add(e.target.files);
            try {
              e.target.value = '';
            } catch {
              /* some browsers refuse; the same file then cannot be picked twice in a row */
            }
          }}
        />
      </label>
      <InfoTip id="dropZone" />
      </div>
      {rejected.length > 0 && <p className="notice">{t('input.rejected', { names: rejected.join(', ') })}</p>}
      {files.length > 0 && (
        <div className="file-list">
          <h3>{t('input.selected')}</h3>
          <ul>
            {files.map((f, i) => (
              <li key={f.name + ':' + f.size + ':' + f.lastModified}>
                <span>{f.name}</span>
                <button type="button" className="link-button" aria-label={t('input.remove') + ' ' + f.name} onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                  {t('input.remove')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="field">
        <FieldLabel htmlFor={linkId} tip="linkField">
          {t('input.link.label')}
        </FieldLabel>
        <input id={linkId} type="text" value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('input.link.placeholder')} autoComplete="off" spellCheck={false} />
      </div>
      {modeSwitch}
      {empty && (
        <p className="error-text" role="alert">
          {t('input.empty')}
        </p>
      )}
      <button type="submit" className="button" disabled={disabled}>
        {t('input.submit')}
      </button>
    </form>
  );
}
