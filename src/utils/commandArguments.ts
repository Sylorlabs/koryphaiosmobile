/**
 * MCP process arguments are transmitted as argv, never passed to a shell.
 * Keep quotes and escaped characters when editing registry-provided arguments.
 */
export function formatCommandArguments(args: readonly string[]): string {
  return args.map((arg) =>
    /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)
      ? arg
      : `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
  ).join(' ');
}

export function parseCommandArguments(value: string): string[] {
  const args: string[] = [];
  let current = '';
  let started = false;
  let quote: '"' | "'" | null = null;

  const finish = () => {
    if (started) args.push(current);
    current = '';
    started = false;
  };

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (char === '\\') {
      const next = value[i + 1];
      const canEscape = next !== undefined && (
        next === '\\' || next === quote ||
        (quote === null && (next === '"' || next === "'" || /\s/.test(next)))
      );
      current += canEscape ? next : '\\';
      started = true;
      if (canEscape) i++;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      started = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }

    if (/\s/.test(char)) {
      finish();
      continue;
    }

    current += char;
    started = true;
  }

  if (quote) throw new Error('Arguments contain an unmatched quote. Close the quote before saving.');
  finish();
  return args;
}
