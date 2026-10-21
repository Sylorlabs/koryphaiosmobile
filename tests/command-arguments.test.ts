import { expect, test } from 'bun:test';
import { formatCommandArguments, parseCommandArguments } from '../src/utils/commandArguments';

test('argv editor formatting preserves every argument including empty and escaped values', () => {
  for (const args of [
    [],
    ['--files', '/Users/Test User/Projects with spaces', '', 'server.js'],
    ['--config', 'C:\\Users\\Test User\\mcp.json', '--verbose'],
    ['--json', '{"message": "a quoted value"}', "an 'apostrophe'"],
    ['--empty', '', '', 'trailing '],
    ['--multiline', 'with\ta tab', 'and\na newline'],
  ]) {
    expect(parseCommandArguments(formatCommandArguments(args))).toEqual(args);
  }
});

test('manual arguments parse quotes, whitespace and escapes without invoking a shell', () => {
  expect(parseCommandArguments('  --files "/Users/Test User/docs"   --message=\'two words\' ""  '))
    .toEqual(['--files', '/Users/Test User/docs', '--message=two words', '']);
  expect(parseCommandArguments('--dir C:\\Users\\name\\file\\with\\backslashes'))
    .toEqual(['--dir', 'C:\\Users\\name\\file\\with\\backslashes']);
  expect(parseCommandArguments('--value quote\\"middle'))
    .toEqual(['--value', 'quote"middle']);
});

test('unfinished quotation has a specific, actionable validation error', () => {
  expect(() => parseCommandArguments('--files "unterminated')).toThrow(/quote/i);
  expect(() => parseCommandArguments("--files 'unterminated")).toThrow(/quote/i);
});
