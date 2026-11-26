// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { archiveFileName, buildZip, judge, streamDeflate } from '../core/convert';
import { asIsArchiveFiles } from '../core/convert/dwcAsIsArchive';
import { asIsChecks } from '../core/convert/dwcAsIsChecks';
import { packDwcAsIs } from '../core/convert/dwcAsIsTables';
import type { AsIsResult, ColumnReason, RowReason, SheetAccount } from '../core/convert/dwcAsIsTables';
import { proposeDwcAsIs } from '../core/convert/dwcAsIs';
import type { DwcProposal } from '../core/convert/dwcAsIs';
import { cellField } from '../core/convert/notWritten';
import { licenceDiffersFindings } from '../core/convert/validate';
import type { LicenceSource } from '../core/convert/prefill';
import type { ParsedFile } from '../core/types';
import type { DwcAsIsBody, DwcAsIsProposal, DwcAsIsView, ExportResult, NotWrittenResult } from './convert.protocol';

const ROW_REASON: Record<RowReason, string> = {
  'empty-row': 'empty row',
  'no-type': 'measurementType is empty (the row has a value)',
  'no-value': 'measurementValue is empty (the row has a type)',
  'no-type-no-value': 'measurementType and measurementValue are both empty',
};
const COLUMN_REASON: Record<ColumnReason, string> = {
  'not-term': 'not a Darwin Core term',
  'other-level': 'a term of another table level, not moved',
  repeated: 'the same term is already written from an earlier column',
  redundant: 'scientificName of an eMoF row: the occurrence has it',
};

/** What this module needs of the handler's session: the files as the converter holds them and what the metadata files said about the licence. */
export interface DwcSession {
  files(): ParsedFile[];
  licenceSource(): LicenceSource;
  today(): string;
}


const ref = (files: readonly ParsedFile[], r: { file: number; sheet: string }) => ({ file: files[r.file].fileName, sheet: r.sheet });
const named = (files: readonly ParsedFile[], p: DwcProposal): DwcAsIsProposal => ({ event: ref(files, p.event), occurrence: ref(files, p.occurrence), ...(p.emof ? { emof: ref(files, p.emof) } : {}) });

/** Darwin Core as it is: the same files, the same proposal, the packing, the checks, the archive and the list of what was not written. */
export function createDwcAsIs(s: DwcSession) {
  function pack(body: DwcAsIsBody): { r: AsIsResult; findings: AsIsResult['findings']; files: ParsedFile[]; proposal: DwcProposal } {
    const files = s.files();
    const proposal = proposeDwcAsIs(files);
    if (proposal === null) throw new Error('These files are not Darwin Core Event, Occurrence and measurement tables: nothing to pack as it is.');
    const r = packDwcAsIs(files, proposal, { basisOfRecord: body.metadata.basisOfRecord });
    const findings = [...r.findings, ...asIsChecks(r, body.metadata, s.today()), ...licenceDiffersFindings(body.metadata.licence, s.licenceSource())];
    return { r, findings, files, proposal };
  }

  function view(body: DwcAsIsBody): DwcAsIsView {
    const { r, findings, files, proposal } = pack(body);
    const j = judge(findings);
    return {
      ok: j.blocking.length === 0,
      proposal: named(files, proposal),
      accounts: r.accounts,
      counts: { events: r.tables.event.rows.length, occurrences: r.tables.occurrence.rows.length, measurements: r.tables.emof?.rows.length ?? 0 },
      lost: r.accounts.reduce((n, a) => n + a.lost, 0),
      findings,
    };
  }

  async function exportArchive(body: DwcAsIsBody): Promise<ExportResult> {
    const { r, findings } = pack(body);
    const j = judge(findings);
    if (j.blocking.length > 0) throw new Error(`Export refused: ${j.blocking.length} finding(s) block it (${[...new Set(j.blocking.map((f) => f.ruleId))].join(', ')}). Nothing was written.`);
    const open = j.acceptRules.filter((id) => !body.accepted.includes(id));
    if (open.length > 0) throw new Error(`Export refused: ${open.join(', ')} not accepted. Nothing was written.`);
    if (r.accounts.some((a) => a.lost !== 0)) throw new Error('Export refused: a row is neither written nor listed. Nothing was written.');
    const deflate = streamDeflate();
    const bytes = await buildZip(asIsArchiveFiles(r, body.metadata, body.generated), deflate);
    return {
      fileName: archiveFileName({ metadata: body.metadata }),
      bytes,
      counts: { events: r.tables.event.rows.length, occurrences: r.tables.occurrence.rows.length, measurements: r.tables.emof?.rows.length ?? 0 },
      deflated: deflate !== undefined,
    };
  }

  /** Rows the archive does not hold (with their original cells) and, once per sheet and reason, the columns it does not hold. */
  function notWritten(body: DwcAsIsBody): NotWrittenResult {
    const { r, files } = pack(body);
    const lines: string[] = [];
    let width = 0;
    let count = 0;
    const out: { cells: string[]; head: string[] }[] = [];
    for (const a of r.accounts) {
      const sheet = files.find((f) => f.fileName === a.file)?.sheets.find((x) => x.name === a.sheet);
      const byLine = new Map((sheet?.rows ?? []).map((row) => [row.line, row.cells]));
      for (const reason of ['not-term', 'other-level', 'repeated', 'redundant'] as const) {
        const cols = a.columns.filter((c) => c.reason === reason);
        if (cols.length === 0) continue;
        out.push({ head: [a.file, a.sheet, '', COLUMN_REASON[reason], 'left-out', cols.map((c) => c.header || `#${c.index + 1}`).join('; ')], cells: [] });
        count++;
      }
      for (const n of a.notWritten) {
        const cells = (byLine.get(n.line) ?? []).map((c) => (c === null ? '' : String(c)));
        width = Math.max(width, cells.length);
        out.push({ head: [a.file, a.sheet, String(n.line), ROW_REASON[n.reason], 'left-out', ''], cells });
        count++;
      }
    }
    lines.push(['file', 'sheet', 'line', 'reason', 'status', 'detail', ...Array.from({ length: width }, (_, i) => `cell ${i + 1}`)].join(','));
    for (const o of out) lines.push([...o.head.map((c) => cellField(c)), ...o.cells.map((c) => cellField(c))].join(','));
    const name = archiveFileName({ metadata: body.metadata }).replace(/\.zip$/, '');
    return { fileName: `${name}-not-written.csv`, blob: new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' }), count };
  }

  /** The proposal for the files held now, by names (the page never sends one: the worker proposes from the files it holds, the person only confirms), or undefined. */
  function proposal(): DwcAsIsProposal | undefined {
    const files = s.files();
    const p = proposeDwcAsIs(files);
    return p === null ? undefined : named(files, p);
  }

  return { view, exportArchive, notWritten, proposal };
}

export type { SheetAccount };
