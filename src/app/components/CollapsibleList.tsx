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

function Toggle({ open, count, controls, onClick }: { open: boolean; count: number; controls: string; onClick: () => void }): React.ReactElement {
  return (
    <button type="button" className="link-button collapsible-toggle" aria-expanded={open} aria-controls={controls} onClick={onClick}>
      {open ? t('list.collapse') : t('list.showAll', { n: count })}
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
  /** What follows the items when the text is whole (the converter's "… (+120)" of lines it did not list). It is part of the hidden rest while the list is collapsed. */
  tail?: string;
}

/**
 * The same, for a list written inside a sentence. The text is exactly `items.join(separator)` (and the tail), so the sentence says what it said before; more than 10 items
 * show the first 5, an ellipsis and the button. The items are in the page either way.
 */
export function CollapsibleText({ items, separator = ', ', tail }: CollapsibleTextProps): React.ReactElement {
  const id = useId();
  const [open, setOpen] = useState(false);
  const whole = items.join(separator) + (tail === undefined || tail === '' ? '' : separator + tail);
  if (!needsCollapse(items.length)) return <>{whole}</>;
  const head = items.slice(0, SHOWN_WHEN_COLLAPSED).join(separator);
  const rest = separator + items.slice(SHOWN_WHEN_COLLAPSED).join(separator) + (tail === undefined || tail === '' ? '' : separator + tail);
  return (
    <span className="collapsible collapsible-text" data-collapsed={open ? 'no' : 'yes'}>
      {head}
      <span id={id} className="collapsible-more" hidden={!open}>
        {rest}
      </span>
      {!open && <span className="collapsible-ellipsis">{separator}…</span>}{' '}
      <Toggle open={open} count={items.length} controls={id} onClick={() => setOpen(!open)} />
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

/**
 * A sentence with a list inside: when `listText` stands in `sentence` and holds more than 10 items, that part is rendered through CollapsibleText and the rest of the sentence is
 * untouched. Otherwise the sentence is returned as it is (a string), so a short list changes nothing.
 */
export function sentenceWithList(sentence: string, listText: string, separator = ', '): React.ReactNode {
  if (listText === '') return sentence;
  const at = sentence.indexOf(listText);
  if (at < 0) return sentence;
  const { items, tail } = splitListText(listText, separator);
  if (!needsCollapse(items.length)) return sentence;
  return (
    <>
      {sentence.slice(0, at)}
      <CollapsibleText items={items} separator={separator} {...(tail === undefined ? {} : { tail })} />
      {sentence.slice(at + listText.length)}
    </>
  );
}
