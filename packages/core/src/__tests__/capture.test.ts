import { describe, it, expect } from 'vitest';
import { parseCapture } from '../capture.js';

// Fixed reference so chrono's relative dates are deterministic. Local time.
const NOW = new Date('2026-05-22T08:00:00');

describe('parseCapture — priority', () => {
  it('reads trailing !/!!/!!! as priority 1/2/3 and strips them', () => {
    expect(parseCapture('准备评审 !!', NOW)).toMatchObject({
      status: 'todo',
      content: '准备评审',
      metadata: { priority: 2 },
    });
    expect(parseCapture('修 bug !!!', NOW).metadata.priority).toBe(3);
    expect(parseCapture('回邮件 !', NOW).metadata.priority).toBe(1);
  });

  it('ignores ! that is not a standalone trailing token', () => {
    // No leading space → part of the sentence ("快去做!"), not a marker.
    const r = parseCapture('快去做!', NOW);
    expect(r.metadata.priority).toBeUndefined();
    expect(r.content).toBe('快去做!');
  });

  it('does not turn a lone "!!" into an empty entry', () => {
    const r = parseCapture('!!', NOW);
    expect(r.metadata.priority).toBeUndefined();
    expect(r.content).toBe('!!');
  });
});

describe('parseCapture — @time', () => {
  it('parses a relative Chinese day to a date-only due', () => {
    const r = parseCapture('准备评审 @明天', NOW);
    expect(r.content).toBe('准备评审');
    expect(r.metadata.due).toBe('2026-05-23');
  });

  it('parses a timed expression to a full ISO instant', () => {
    const r = parseCapture('@明早7点 写周报', NOW);
    expect(r.content).toBe('写周报');
    // Timed → full ISO (not the date-only YYYY-MM-DD form); the instant is
    // tomorrow 07:00 local regardless of the test machine's timezone.
    expect(r.metadata.due).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date(r.metadata.due!);
    expect(d.getHours()).toBe(7);
    expect(d.getDate()).toBe(23);
  });

  it('anchors a time-only expression to today, even if already past', () => {
    // NOW is 08:00; "7点" is earlier today — must stay TODAY, not roll to tomorrow.
    const past = parseCapture('交卷 @7点', NOW);
    expect(past.content).toBe('交卷');
    const dp = new Date(past.metadata.due!);
    expect(dp.getDate()).toBe(22); // today
    expect(dp.getHours()).toBe(7);

    // A later-today time also resolves to today.
    const future = parseCapture('开会 @9:30', NOW);
    const df = new Date(future.metadata.due!);
    expect(df.getDate()).toBe(22);
    expect(df.getHours()).toBe(9);
    expect(df.getMinutes()).toBe(30);
  });

  it('parses a slash date via the fallback locale', () => {
    expect(parseCapture('交报告 @5/25', NOW).metadata.due).toBe('2026-05-25');
  });

  it('keeps an unparseable @token as a literal due string (no throw)', () => {
    const r = parseCapture('搞定 @下周财报X', NOW);
    expect(r.metadata.due).toBe('下周财报X');
    expect(r.content).toBe('搞定');
  });

  it('preserves #tags around an @time', () => {
    const r = parseCapture('评审 @明天 #工作', NOW);
    expect(r.content).toBe('评审 #工作');
    expect(r.metadata.due).toBe('2026-05-23');
  });
});

describe('parseCapture — combined and regression', () => {
  it('extracts both due and priority from one line', () => {
    const r = parseCapture('准备评审 @周三 !!', NOW);
    expect(r.status).toBe('todo');
    expect(r.content).toBe('准备评审');
    expect(r.metadata.priority).toBe(2);
    expect(r.metadata.due).toBe('2026-05-27'); // upcoming Wednesday
  });

  it('still honors slash commands', () => {
    expect(parseCapture('/done 买牛奶', NOW)).toMatchObject({ status: 'done', content: '买牛奶' });
    expect(parseCapture('/log 跑步了', NOW)).toMatchObject({ status: 'log', content: '跑步了' });
  });

  it('does not extract due/priority for non-todo entries', () => {
    // A /log body with a stray @ or trailing ! is kept verbatim.
    const r = parseCapture('/log 提到 @明天 的事 !', NOW);
    expect(r.status).toBe('log');
    expect(r.metadata.due).toBeUndefined();
    expect(r.metadata.priority).toBeUndefined();
    expect(r.content).toBe('提到 @明天 的事 !');
  });

  it('leaves plain input untouched', () => {
    const r = parseCapture('买菜 #生活', NOW);
    expect(r).toEqual({ status: 'todo', content: '买菜 #生活', metadata: {} });
  });
});
