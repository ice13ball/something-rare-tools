// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React, { useId, useState } from 'react';
import { t } from '../i18n';

/*
 * A long list of examples (cells, rows, names, values) is read badly, so more than COLLAPSE_AFTER items show only the first SHOWN_WHEN_COLLAPSED and a button
 * "Show all (N)" that turns into "Collapse". COLLAPSE_AFTER items or fewer are shown whole, with no button.
 *
 * ⛔ This is view state and nothing else: the open/closed state lives in the component, never in a request, a result, a report, the companion file or an archive.
 * ⛔ Only a list of examples is wrapped in it. A heading with its count, a rule id, a level and every decision button stay outside, always visible.
 * Every item is in the page even when the list is collapsed (the rest carries `hidden`): the print stylesheet (styles.css) shows them all and drops the button, and the
 * button is a native <button> with aria-expanded and aria-controls, so it works from the keyboard.
 */
export const COLLAPSE_AFTER = 10;
export const SHOWN_WHEN_COLLAPSED = 5;

export const needsCollapse = (count: number): boolean => count > COLLAPSE_AFTER;

function Toggle({ open, count, lines, controls, describedBy, onClick }: { open: boolean; count: number; lines?: number | undefined; controls: string; describedBy?: string; onClick: () => void }): React.ReactElement {
  return (
    <button type="button" className="link-button collapsible-toggle" aria-expanded={open} aria-controls={controls} {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })} onClick={onClick}>
      {open ? t('list.collapse') : lines === undefined ? t('list.showAll', { n: count }) : t('list.showAllLines', { n: lines })}
    </button>
  );
}

export interface CollapsibleListProps<T> {
  items: readonly T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  /** Attributes of the <li> (a data attribute the tests and the styles read). */
  itemAttrs?: (item: T) => Record<string, string>;
  className?: string;
}

/** A list of separate items (<ul>): the first 5 and a button when there are more than 10. */
export function CollapsibleList<T>({ items, itemKey, renderItem, itemAttrs, className }: CollapsibleListProps<T>): React.ReactElement {
  const id = useId();
  const [open, setOpen] = useState(false);
  const long = needsCollapse(items.length);
  const hiddenNow = long && !open;
  return (
    <div className="collapsible" data-collapsed={hiddenNow ? 'yes' : 'no'}>
      <ul id={id} {...(className === undefined ? {} : { className })}>
        {items.map((item, i) => {
          const extra = long && i >= SHOWN_WHEN_COLLAPSED;
          return (
            <li key={itemKey(item)} {...(itemAttrs === undefined ? {} : itemAttrs(item))} {...(extra ? { className: 'collapsible-more', hidden: hiddenNow } : {})}>
              {renderItem(item)}
            </li>
          );
        })}
      </ul>
      {long && <Toggle open={open} count={items.length} controls={id} onClick={() => setOpen(!open)} />}
    </div>
  );
}

export interface CollapsibleTextProps {
  /** The items of a list that a sentence holds joined by `separator` ("2–3, 6, 9–12, ..."). */
  items: readonly string[];
  separator?: string;
  /** Controlled by the sentence, whose button stands after the whole sentence. */
  open: boolean;
  controlsId: string;
}

/** The list written inside a sentence: the text is exactly `items.join(separator)` when open; collapsed it is the first 5 and an ellipsis. */
export function CollapsibleText({ items, separator = ', ', open, controlsId }: CollapsibleTextProps): React.ReactElement {
  if (!needsCollapse(items.length)) return <>{items.join(separator)}</>;
  const head = items.slice(0, SHOWN_WHEN_COLLAPSED).join(separator);
  const rest = separator + items.slice(SHOWN_WHEN_COLLAPSED).join(separator);
  return (
    <span className="collapsible-text" data-collapsed={open ? 'no' : 'yes'}>
      {head}
      <span id={controlsId} className="collapsible-more" hidden={!open}>
        {rest}
      </span>
      {!open && <span className="collapsible-ellipsis">{separator}…</span>}
    </span>
  );
}

/** The parts of a list written in a sentence: a trailing "… (+n)" is the converter's note about lines it left out, not an item. */
export function splitListText(text: string, separator = ', '): { items: string[]; tail?: string } {
  const parts = text.split(separator);
  const last = parts[parts.length - 1] ?? '';
  if (parts.length > 1 && /^…/.test(last)) return { items: parts.slice(0, -1), tail: last };
  return { items: parts };
}

/** "… (+40)": the converter's count of lines it did not list, as a number ('' when the tail has none). */
const tailCount = (tail: string | undefined): string => /\(\+(\d+)\)/.exec(tail ?? '')?.[1] ?? '';

function SentenceWithList({ before, items, separator, tail, after, lines }: { before: string; items: readonly string[]; separator: string; tail: string | undefined; after: string; lines: number | undefined }): React.ReactElement {
  const id = useId();
  const [open, setOpen] = useState(false);
  const left = tailCount(tail);
  return (
    <span className="collapsible" id={id + 's'} data-collapsed={open ? 'no' : 'yes'}>
      {before}
      <CollapsibleText items={items} separator={separator} open={open} controlsId={id} />
      {after}{' '}
      <Toggle open={open} count={items.length} lines={lines} controls={id} describedBy={id + 's'} onClick={() => setOpen(!open)} />
      {left !== '' && <span className="collapsible-note muted"> {t('list.tailNote', { n: Number(left) })}</span>}
    </span>
  );
}

/**
 * A sentence with a list inside: when `listText` stands in `sentence` and holds more than 10 items, the list is collapsed and the button stands right after the whole sentence, so the
 * sentence is never broken by it. `lines` is the true number of lines the ranges cover: the button says "Show all 550 lines", not the number of ranges. A "… (+n)" tail (lines the
 * converter did not list) is taken out of the sentence and said plainly after the button, open or closed. A short list returns the sentence as it is (a string).
 */
export function sentenceWithList(sentence: string, listText: string, opts: { lines?: number; separator?: string } = {}): React.ReactNode {
  if (listText === '') return sentence;
  const at = sentence.indexOf(listText);
  if (at < 0) return sentence;
  const separator = opts.separator ?? ', ';
  const { items, tail } = splitListText(listText, separator);
  if (!needsCollapse(items.length)) return sentence;
  return <SentenceWithList before={sentence.slice(0, at)} items={items} separator={separator} tail={tail} after={sentence.slice(at + listText.length)} lines={opts.lines} />;
}
