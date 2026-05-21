import { describe, it, expect } from 'vitest';
import { parseCommand, matchSlashCommands, SLASH_COMMANDS } from '../commands.js';

describe('parseCommand', () => {
  it('strips a recognized prefix and resolves status', () => {
    expect(parseCommand('/done buy milk')).toEqual({ status: 'done', content: 'buy milk' });
    expect(parseCommand('/log went running')).toEqual({ status: 'log', content: 'went running' });
    expect(parseCommand('/todo file taxes')).toEqual({ status: 'todo', content: 'file taxes' });
  });

  it('falls back when there is no command prefix', () => {
    expect(parseCommand('plain todo')).toEqual({ status: 'todo', content: 'plain todo' });
  });

  it('respects the fallback status argument', () => {
    expect(parseCommand('plain', 'log')).toEqual({ status: 'log', content: 'plain' });
  });

  it('requires the separating space to treat input as a command', () => {
    expect(parseCommand('/done')).toEqual({ status: 'todo', content: '/done' });
  });
});

describe('matchSlashCommands', () => {
  it('returns null when input is not a command token', () => {
    expect(matchSlashCommands('hello')).toBeNull();
    expect(matchSlashCommands('/done x')).toBeNull(); // space locks it in
  });

  it('returns all commands for a bare slash', () => {
    expect(matchSlashCommands('/')).toEqual(SLASH_COMMANDS);
  });

  it('filters by the typed prefix, case-insensitively', () => {
    expect(matchSlashCommands('/d').map(c => c.cmd)).toEqual(['/done']);
    expect(matchSlashCommands('/DO').map(c => c.cmd)).toEqual(['/done']);
    expect(matchSlashCommands('/t').map(c => c.cmd)).toEqual(['/todo']);
  });

  it('returns an empty array for an unknown command', () => {
    expect(matchSlashCommands('/zzz')).toEqual([]);
  });
});
