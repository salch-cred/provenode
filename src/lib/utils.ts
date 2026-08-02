export const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

export const fmt = (n?: number | null): string => {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n/1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n/1048576).toFixed(1)} MB`;
  return `${(n/1073741824).toFixed(2)} GB`;
};

export const ago = (iso?: string | null): string => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime(), m = Math.floor(diff/60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
};