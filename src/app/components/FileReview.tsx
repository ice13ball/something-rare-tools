// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import type { ColumnProposal, LayoutPlan, SheetMapping } from '../../core/types';
import type { FileSummary } from '../../worker/protocol';
import { t, useLang } from '../i18n';
import { InfoTip } from './InfoTip';
import { LayoutConfirm } from './LayoutConfirm';
import { MappingEditor } from './MappingEditor';
import type { RoleChoice } from '../mappingModel';
import type { TipId } from '../tips';

export interface FileReviewProps {
  file: FileSummary;
  layout: LayoutPlan;
  mappings: SheetMapping[];
  proposals: Record<string, ColumnProposal[]>;
  onLayout: (plan: LayoutPlan) => void;
  onMapping: (mapping: SheetMapping) => void;
  /** The role dropdown and the tip of its header; /check's own by default. */
  roleKinds?: readonly RoleChoice[];
  rolesTip?: TipId;
}

/** One file of the confirmation step: its layout, then the column table of every sheet the layout reads. */
export function FileReview({ file, layout, mappings, proposals, onLayout, onMapping, roleKinds, rolesTip }: FileReviewProps): React.ReactElement {
  useLang();
  return (
    <section className="file-review">
      <h3>{t('confirm.file', { name: file.fileName })}</h3>
      <p className="muted">
        {t('confirm.encoding', { encoding: file.encoding })}
        <InfoTip id="encoding" />
      </p>
      <LayoutConfirm plan={layout} sheets={file.sheets} onChange={onLayout} />
      {mappings.map((m) => {
        const long = layout.tables.find((tb) => tb.sheet === m.sheet)?.long;
        const consumed = long ? new Set<number>([long.parameterCol, long.valueCol, ...(long.unitCol === undefined ? [] : [long.unitCol])]) : undefined;
        return (
          <MappingEditor
            key={m.sheet}
            sheet={m.sheet}
            proposals={proposals[m.sheet] ?? []}
            samples={file.samples[m.sheet] ?? []}
            mapping={m}
            layoutColumns={consumed}
            {...(roleKinds ? { roleKinds } : {})}
            {...(rolesTip ? { rolesTip } : {})}
            onChange={onMapping}
          />
        );
      })}
    </section>
  );
}
