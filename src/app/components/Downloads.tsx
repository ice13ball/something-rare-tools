// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useEffect, useState } from 'react';
import type { MetadataDraft } from '../../core/output/draft';
import type { DatasetSummary, Engine, ExportKind } from '../../worker/protocol';
import { downloadText, fileBase } from '../download';
import { draftSections } from '../draftModel';
import { t, useLang } from '../i18n';
import { HeadingTip, InfoTip } from './InfoTip';

export interface DownloadsProps {
  datasets: DatasetSummary[];
  engine: Pick<Engine, 'export' | 'draft'>;
  /** Replaced in tests. */
  download?: typeof downloadText;
  /** Replaced in tests. */
  writeClipboard?: (text: string) => Promise<void>;
}

const FILES: Record<ExportKind, { suffix: string; mime: string }> = {
  cleanCsv: { suffix: '.clean.csv', mime: 'text/csv' },
  sidecar: { suffix: '.sidecar.csv', mime: 'text/csv' },
  geojson: { suffix: '.geojson', mime: 'application/geo+json' },
  iso19139: { suffix: '.iso19139.xml', mime: 'application/xml' },
  datacite: { suffix: '.datacite.xml', mime: 'application/xml' },
};

const defaultClipboard = (text: string): Promise<void> => {
  if (!navigator.clipboard) return Promise.reject(new Error('no clipboard'));
  return navigator.clipboard.writeText(text);
};

function CopyButton({ text, label, write }: { text: string; label: string; write: (s: string) => Promise<void> }): React.ReactElement {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <>
      <button
        type="button"
        className="link-button"
        aria-label={label}
        onClick={() => {
          write(text).then(
            () => setState('copied'),
            () => setState('failed'),
          );
        }}
      >
        {state === 'copied' ? t('downloads.copied') : t('downloads.copy')}
      </button>
      {state === 'failed' && (
        <span className="error-text" role="alert">
          {' '}
          {t('downloads.copyFailed')}
        </span>
      )}
    </>
  );
}

function DraftPanel({ datasetId, engine, write }: { datasetId: string; engine: Pick<Engine, 'draft'>; write: (s: string) => Promise<void> }): React.ReactElement {
  const { lang } = useLang();
  const [draft, setDraft] = useState<MetadataDraft | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    engine.draft([datasetId]).then(
      (d) => {
        if (!cancelled) setDraft(d);
      },
      (e: unknown) => {
        if (!cancelled) setFailed(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [engine, datasetId]);
  if (failed !== null) {
    return (
      <p className="error-text" role="alert">
        {t('downloads.failed', { message: failed })}
      </p>
    );
  }
  if (!draft) return <p className="muted">{t('check.busy')}</p>;
  const sections = draftSections(draft, lang);
  return (
    <div className="draft-panel">
      <HeadingTip tip="draft">
        <h4>{t('downloads.draft')}</h4>
      </HeadingTip>
      <p className="muted">{t('downloads.draft.hint')}</p>
      {sections.length === 0 && <p className="muted">{t('downloads.none')}</p>}
      {sections.map((s) => (
        <section key={s.id} className="draft-section" data-section={s.id}>
          <h5>{s.heading}</h5>
          <dl>
            {s.fields.map((f) => (
              <React.Fragment key={f.key}>
                <dt>{f.label}</dt>
                <dd>
                  <code className={f.value.includes('\n') ? 'multiline' : undefined}>{f.value}</code>{' '}
                  <CopyButton text={f.copy} label={`${t('downloads.copy')}: ${s.heading} — ${f.label}`} write={write} />
                </dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/**
 * Per dataset: clean CSV, sidecar CSV, ISO 19139 and DataCite XML, and the metadata draft (values with the GeoNetwork field
 * names, copy buttons). One GeoJSON for all datasets. Everything is made in the browser and offered as a Blob download.
 */
export function Downloads({ datasets, engine, download = downloadText, writeClipboard = defaultClipboard }: DownloadsProps): React.ReactElement {
  useLang();
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: ExportKind, ids: string[], base: string): Promise<void> => {
    setError(null);
    try {
      const text = await engine.export(kind, ids);
      const f = FILES[kind];
      download(text, base + f.suffix, f.mime);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const withPoints = datasets.filter((d) => d.pointCount > 0);
  return (
    <section className="downloads" aria-labelledby="downloads-title">
      <h2 id="downloads-title">{t('downloads.title')}</h2>
      <p className="muted">{t('downloads.intro')}</p>
      {error !== null && (
        <p className="error-text" role="alert">
          {t('downloads.failed', { message: error })}
        </p>
      )}
      {datasets.length === 0 && <p className="muted">{t('downloads.none')}</p>}
      {datasets.map((d) => {
        const base = fileBase(d.label);
        return (
          <article key={d.id} className="download-dataset" data-dataset={d.id}>
            <h3>{t('downloads.dataset', { label: d.label })}</h3>
            <p className="muted">{t('downloads.rows', { rows: d.rowCount })}</p>
            <div className="download-buttons">
              <span className="download-item">
                <button type="button" className="button secondary" onClick={() => void run('cleanCsv', [d.id], base)}>
                  {t('downloads.cleanCsv')}
                </button>
                <InfoTip id="cleanCsv" />
              </span>
              <span className="download-item">
                <button type="button" className="button secondary" onClick={() => void run('sidecar', [d.id], base)}>
                  {t('downloads.sidecar')}
                </button>
                <InfoTip id="sidecar" />
              </span>
              <span className="download-item">
                <button type="button" className="button secondary" onClick={() => void run('iso19139', [d.id], base)}>
                  {t('downloads.iso')}
                </button>
                <InfoTip id="iso19139" />
              </span>
              <span className="download-item">
                <button type="button" className="button secondary" onClick={() => void run('datacite', [d.id], base)}>
                  {t('downloads.datacite')}
                </button>
                <InfoTip id="datacite" />
              </span>
            </div>
            <DraftPanel datasetId={d.id} engine={engine} write={writeClipboard} />
          </article>
        );
      })}
      {withPoints.length > 0 && (
        <div className="download-buttons">
          <span className="download-item">
            <button
              type="button"
              className="button secondary"
              onClick={() => void run('geojson', datasets.map((d) => d.id), datasets.length === 1 ? fileBase(datasets[0].label) : 'datasets')}
            >
              {t('downloads.geojson')}
            </button>
            <InfoTip id="geojson" />
          </span>
        </div>
      )}
    </section>
  );
}
