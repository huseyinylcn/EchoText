import { ACTIVE_STATUSES } from '../api.js';
import { formatDate, formatDuration, statusText } from '../format.js';

export default function HistoryList({ jobs, selectedId, onSelect, onDelete }) {
  return (
    <aside className="history">
      <h2>Önceki çeviriler</h2>
      {jobs.length === 0 ? (
        <p className="muted">Henüz kayıt yok.</p>
      ) : (
        <ul>
          {jobs.map((job) => {
            const active = ACTIVE_STATUSES.includes(job.status);
            return (
              <li key={job.id} className={job.id === selectedId ? 'selected' : ''}>
                <button className="history-item" onClick={() => onSelect(job.id)}>
                  <span className="history-name" title={job.original_name}>
                    {job.original_name}
                  </span>
                  <span className="history-meta">
                    {formatDate(job.created_at)}
                    {job.duration_sec != null && ` · ${formatDuration(job.duration_sec)}`}
                  </span>
                  <span className={`badge badge-${job.status}`}>{statusText(job)}</span>
                </button>
                <button
                  className="icon-button"
                  title={active ? 'İşlem sürerken silinemez' : 'Kaydı sil'}
                  aria-label="Kaydı sil"
                  disabled={active}
                  onClick={() => onDelete(job)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
