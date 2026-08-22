export function parseArgs(argv, { value = [], boolean = [] } = {}) {
  const values = new Set(value); const booleans = new Set(boolean); const allowed = new Set([...values, ...booleans]); const args = {};
  if (!Array.isArray(argv) || !Array.isArray(value) || !Array.isArray(boolean) || values.size !== value.length || booleans.size !== boolean.length || [...values].some((key) => booleans.has(key))) throw new Error('invalid parser option specification');
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (typeof token !== 'string' || !token.startsWith('--') || token === '--') throw new Error(`unexpected positional argument: ${token ?? '(missing)'}`);
    const key = token.slice(2);
    if (!key || !allowed.has(key)) throw new Error(`unknown option: --${key}`);
    if (Object.hasOwn(args, key)) throw new Error(`duplicate or ambiguous option: --${key}`);
    if (booleans.has(key)) { args[key] = true; continue; }
    const next = argv[i + 1];
    if (next === undefined || (typeof next === 'string' && next.startsWith('--'))) throw new Error(`missing value for --${key}`);
    args[key] = next; i++;
  }
  return args;
}

export function integer(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER, name = 'value' } = {}) {
  const result = +(value ?? fallback);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return result;
}
