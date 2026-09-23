/** Small pure relative-time formatter for the scene/version lists. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return 'unknown';
  }
  const diff = Math.max(0, nowMs - then);

  if (diff < 45_000) {
    return 'just now';
  }
  if (diff < HOUR) {
    const minutes = Math.max(1, Math.round(diff / MINUTE));
    return `${minutes} min ago`;
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return `${hours} hr ago`;
  }
  if (diff < 30 * DAY) {
    const days = Math.round(diff / DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (diff < 365 * DAY) {
    const months = Math.round(diff / (30 * DAY));
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }
  const years = Math.round(diff / (365 * DAY));
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
