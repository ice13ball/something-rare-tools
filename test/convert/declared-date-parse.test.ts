// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 3, Task 17: the one date or interval the person types for a sheet with no date at all. Invented values only.
import { describe, expect, it } from 'vitest';
import { readDeclaredDate } from '../../src/core/convert/declaredDate';
import { eventDateText } from '../../src/core/convert/events';

const TODAY = '2026-11-18';

describe('readDeclaredDate', () => {
  it('reads a year, a month, a day and an interval of them, and writes them back as typed', () => {
    for (const t of ['2021', '2021-05', '2021-05-17', '2020-01-01/2021-12-31', '2019/2021', '2021-05/2021-07', '2021-05-17/2021-05-19']) {
      const r = readDeclaredDate(t, TODAY);
      expect(r.ok, t).toBe(true);
      if (r.ok) expect(eventDateText(r.date), t).toBe(t);
    }
  });
  it('trims the typed text', () => {
    const r = readDeclaredDate(' 2021-05 ', TODAY);
    expect(r.ok && r.text).toBe('2021-05');
  });
  it('refuses a shape that is not ISO 8601, naming the reason format', () => {
    for (const t of ['', '2021-13', '2021-00', '2021-02-30', '21', '2021/05', '05/2021', '2021-5', 'May 2021', '2021-05-17T10:00', '2021-05/', '/2021', '2020/2021/2022', '2021-05-17 / 2021-05-19']) {
      const r = readDeclaredDate(t, TODAY);
      expect(r.ok, t).toBe(false);
      if (!r.ok) expect(r.reason, t).toBe('format');
    }
  });
  it('refuses an interval that ends before it starts, naming the reason order', () => {
    for (const t of ['2022/2021', '2021-06/2021-05', '2021-06-02/2021-06-01', '2021-06/2021']) {
      const r = readDeclaredDate(t, TODAY);
      expect(r.ok, t).toBe(false);
      if (!r.ok) expect(r.reason, t).toBe('order');
    }
  });
  it('refuses a value in the future, naming the reason future, but keeps today and this year', () => {
    for (const t of ['2027', '2026-12', '2026-12-01', '2021/2030']) {
      const r = readDeclaredDate(t, TODAY);
      expect(r.ok, t).toBe(false);
      if (!r.ok) expect(r.reason, t).toBe('future');
    }
    for (const t of ['2026', '2026-11', '2026-11-18', '2026-01/2026-11-18']) expect(readDeclaredDate(t, TODAY).ok, t).toBe(true);
  });
  it('marks an interval longer than a year', () => {
    expect(readDeclaredDate('2020-01-01/2021-12-31', TODAY)).toMatchObject({ ok: true, long: true });
    expect(readDeclaredDate('2019/2021', TODAY)).toMatchObject({ ok: true, long: true });
    expect(readDeclaredDate('2021-01-01/2021-12-31', TODAY)).toMatchObject({ ok: true, long: false });
    expect(readDeclaredDate('2021', TODAY)).toMatchObject({ ok: true, long: false });
    expect(readDeclaredDate('2020', TODAY)).toMatchObject({ ok: true, long: false });
  });
});
