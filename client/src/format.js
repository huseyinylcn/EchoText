export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDuration(seconds) {
  if (seconds == null) return '';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// SQLite datetime('now') UTC döndürür; yerel saate çeviriyoruz.
export function formatDate(sqliteDate) {
  return new Date(`${sqliteDate.replace(' ', 'T')}Z`).toLocaleString('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function statusText(job) {
  const progress = job.progress_total ? ` (${job.progress_current}/${job.progress_total})` : '';
  switch (job.status) {
    case 'queued':
      return 'Sırada bekliyor';
    case 'preparing':
      return 'Ses dosyası hazırlanıyor';
    case 'transcribing':
      return `Yazıya dökülüyor${progress}`;
    case 'translating':
      return `Türkçeye çevriliyor${progress}`;
    case 'done':
      return 'Tamamlandı';
    case 'error':
      return 'Hata';
    default:
      return job.status;
  }
}
