export function retryDelay(response, attempt, capMs = 5000) {
  const raw = response?.headers?.get('retry-after');
  const seconds = raw && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) * 1000 : NaN;
  const date = raw && !Number.isFinite(seconds) ? Date.parse(raw) - Date.now() : NaN;
  return Math.min(capMs, Math.max(0, Number.isFinite(seconds) ? seconds : Number.isFinite(date) ? date : 50 * 2 ** attempt + attempt * 17));
}
