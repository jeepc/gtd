import { describe, it, expect } from 'vitest';
import { parseInlineFields, previewCapture } from '../fields.js';

describe('parseInlineFields (#key:value, Level 2)', () => {
  it('#tag (no colon) stays a tag; #key:value becomes a field', () => {
    const r = parseInlineFields('准备评审 #工作 #project:q3');
    expect(r.content).toBe('准备评审 #工作');
    expect(r.tags).toEqual(['工作']);
    expect(r.fields).toEqual({ project: 'q3' });
  });

  it('#due:MMDD → current-year ISO date (date-only)', () => {
    const year = new Date().getFullYear();
    const r = parseInlineFields('买牛奶 #due:0525');
    expect(r.fields.due).toBe(`${year}-05-25`);
    expect(r.content).toBe('买牛奶');
  });

  it('#due accepts full ISO date and datetime', () => {
    expect(parseInlineFields('x #due:2026-05-25').fields.due).toBe('2026-05-25');
    expect(parseInlineFields('x #due:2026-05-25T09:00').fields.due).toBe('2026-05-25T09:00');
  });

  it('#due:MMDD accepts a compact time after @ or T', () => {
    const year = new Date().getFullYear();
    expect(parseInlineFields('x #due:0525@0900').fields.due).toBe(`${year}-05-25T09:00`);
    expect(parseInlineFields('x #due:0525@9:00').fields.due).toBe(`${year}-05-25T09:00`);
    expect(parseInlineFields('x #due:0525T1430').fields.due).toBe(`${year}-05-25T14:30`);
    // out-of-range time is rejected (left literal)
    expect(parseInlineFields('x #due:0525@2599').fields.due).toBeUndefined();
  });

  it('priority shortcuts and #priority:N', () => {
    expect(parseInlineFields('x #!').fields.priority).toBe(1);
    expect(parseInlineFields('x #!!').fields.priority).toBe(2);
    expect(parseInlineFields('x #!!!').fields.priority).toBe(3);
    expect(parseInlineFields('x #priority:2').fields.priority).toBe(2);
  });

  it('malformed values are left literal, not captured', () => {
    // empty value: no field, token stays in content (and is a tag-less literal)
    const r = parseInlineFields('x #due:');
    expect(r.fields.due).toBeUndefined();
    expect(r.content).toContain('#due:');
    // invalid date
    expect(parseInlineFields('x #due:9999').fields.due).toBeUndefined();
  });

  it('mix of tags, fields, and priority in one line', () => {
    const r = parseInlineFields('准备 Q3 评审 #工作 #project:q3 #due:0525 #!!');
    expect(r.tags).toEqual(['工作']);
    expect(r.fields).toMatchObject({ project: 'q3', priority: 2 });
    expect(typeof r.fields.due).toBe('string');
    expect(r.content).toBe('准备 Q3 评审 #工作');
  });

  it('unknown key coerces to string', () => {
    expect(parseInlineFields('x #area:health').fields.area).toBe('health');
  });
});

describe('previewCapture', () => {
  it('reflects slash command, content, tags, and fields like createEntry', () => {
    const year = new Date().getFullYear();
    const p = previewCapture('/done 买牛奶 #生活 #due:0525@0900 #!!');
    expect(p.status).toBe('done');
    expect(p.content).toBe('买牛奶 #生活');
    expect(p.tags).toEqual(['生活']);
    expect(p.fields.due).toBe(`${year}-05-25T09:00`);
    expect(p.fields.priority).toBe(2);
  });

  it('plain text → todo with no fields', () => {
    const p = previewCapture('随便记一条');
    expect(p.status).toBe('todo');
    expect(p.tags).toEqual([]);
    expect(Object.keys(p.fields)).toEqual([]);
  });
});
