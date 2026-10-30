import { useMemo, useState } from 'react';
import { ACTIVE_STATUSES } from '../api.js';
import { formatBytes, formatDate, formatDuration, statusText } from '../format.js';
import AlignedView from './AlignedView.jsx';

function downloadText(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function baseName(fileName) {
  return fileName.replace(/\.[^.]+$/, '');
}

function TextActions({ label, text, fileName }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="text-actions">
      <span className="text-actions-label">{label}</span>
      <button onClick={copy}>{copied ? 'Kopyalandı' : 'Kopyala'}</button>
      <button onClick={() => downloadText(text, fileName)}>.txt indir</button>
    </div>
  );
}

const PARAGRAPH_CHARS = 450;

// Satır sonu olmayan uzun dökümleri cümle sınırlarından paragraflara böler.
// Tek parça on binlerce karakterlik metin hem okunmuyor hem de tarayıcıyı yavaşlatıyor.
function toParagraphs(text) {
  if (text.includes('\n')) return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  const paragraphs = [];
  let current = '';
  for (const { segment } of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)) {
    current += segment;
    if (current.length >= PARAGRAPH_CHARS) {
      paragraphs.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) paragraphs.push(current.trim());
  return paragraphs;
}

// Cümle eşleşmesi olmayan (eski) kayıtlar için iki sütunlu düz görünüm.
function PlainColumns({ english, turkish, active }) {
  const englishParagraphs = useMemo(() => toParagraphs(english), [english]);
  const turkishParagraphs = useMemo(() => (turkish ? toParagraphs(turkish) : null), [turkish]);

  return (
    <div className="aligned">
      <div className="aligned-head">
        <span>İngilizce (orijinal)</span>
        <span>Türkçe</span>
      </div>
      <div className="aligned-row">
        <div className="aligned-cell" lang="en">
          {englishParagraphs.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
        <div className="aligned-cell" lang="tr">
          {turkishParagraphs ? (
            turkishParagraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)
          ) : (
            <p className="muted">{active ? 'Çeviri hazırlanıyor…' : 'Çeviri yok.'}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JobDetail({ job, onRetranslate }) {
  const active = ACTIVE_STATUSES.includes(job.status);
  const showProgress = active && job.progress_total > 0;
  const name = baseName(job.original_name);

  const hasSegments = Boolean(job.segments?.length);
  const translationIncomplete = hasSegments && job.segments.some((segment) => segment.tr == null);
  const canRetranslate = !active && Boolean(job.english_text) && (!hasSegments || translationIncomplete);

  return (
    <article className="detail">
      <header className="detail-header">
        <h2 title={job.original_name}>{job.original_name}</h2>
        <p className="muted">
          {formatDate(job.created_at)} · {formatBytes(job.file_size)}
          {job.duration_sec != null && ` · ${formatDuration(job.duration_sec)}`}
        </p>
      </header>

      {active && (
        <div className="status">
          <p>{statusText(job)}…</p>
          <div className={`bar${showProgress ? '' : ' indeterminate'}`}>
            <div
              className="bar-fill"
              style={showProgress ? { width: `${(job.progress_current / job.progress_total) * 100}%` } : undefined}
            />
          </div>
        </div>
      )}

      {job.status === 'error' && <p className="error">{job.error}</p>}

      {canRetranslate && (
        <div className="notice">
          <p>
            {hasSegments
              ? 'Çeviri yarıda kalmış. Kalan cümleler çevrilerek tamamlanabilir.'
              : 'Bu kayıt eski biçimde çevrilmiş; cümleler eşleşmiyor. Hizalı çeviri oluşturulursa cümlenin üzerine gelince karşılığı vurgulanır.'}{' '}
            Ses yeniden işlenmez, yalnızca çeviri yapılır.
          </p>
          <button className="primary" onClick={() => onRetranslate(job.id)}>
            {hasSegments ? 'Çeviriyi tamamla' : 'Hizalı çeviri oluştur'}
          </button>
        </div>
      )}

      {(job.english_text || job.turkish_text) && (
        <div className="toolbar">
          {job.turkish_text && (
            <TextActions label="Türkçe" text={job.turkish_text} fileName={`${name} - Türkçe.txt`} />
          )}
          {job.english_text && (
            <TextActions label="İngilizce" text={job.english_text} fileName={`${name} - English.txt`} />
          )}
          {job.english_text && !active && (
            <a className="button-link primary" href={`/api/jobs/${job.id}/pdf`} download>
              PDF indir (yan yana)
            </a>
          )}
        </div>
      )}

      {hasSegments ? (
        <AlignedView segments={job.segments} />
      ) : job.english_text ? (
        <PlainColumns english={job.english_text} turkish={job.turkish_text} active={active} />
      ) : (
        <p className="muted">{active ? 'Ses yazıya dökülüyor…' : 'Metin yok.'}</p>
      )}
    </article>
  );
}
