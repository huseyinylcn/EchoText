import { useRef, useState } from 'react';
import { MAX_UPLOAD_BYTES, uploadAudio } from '../api.js';
import { formatBytes } from '../format.js';

export default function UploadBox({ onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const uploading = progress !== null;

  async function handleFile(file) {
    if (!file || uploading) return;
    setError('');
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`Dosya çok büyük (${formatBytes(file.size)}). En fazla ${formatBytes(MAX_UPLOAD_BYTES)} yüklenebilir.`);
      return;
    }
    setProgress(0);
    try {
      const job = await uploadAudio(file, setProgress);
      onUploaded(job);
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  return (
    <section className="upload">
      <div
        className={`dropzone${dragging ? ' dragging' : ''}${uploading ? ' busy' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <>
            <p className="dropzone-title">Yükleniyor… %{Math.round(progress * 100)}</p>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        ) : (
          <>
            <p className="dropzone-title">İngilizce ses dosyasını buraya sürükleyin ya da tıklayıp seçin</p>
            <p className="muted">mp3, m4a, wav, ogg, webm, flac, mp4… · en fazla {formatBytes(MAX_UPLOAD_BYTES)}</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,video/*"
          hidden
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
