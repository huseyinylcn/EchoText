import { useCallback, useEffect, useState } from 'react';
import { ACTIVE_STATUSES, deleteJob, getJob, listJobs, retranslateJob } from './api.js';
import HistoryList from './components/HistoryList.jsx';
import JobDetail from './components/JobDetail.jsx';
import UploadBox from './components/UploadBox.jsx';

const POLL_MS = 2000;

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [error, setError] = useState('');

  const refreshJobs = useCallback(async () => {
    try {
      setJobs(await listJobs());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  // Devam eden iş varken listeyi düzenli yeniliyoruz.
  const hasActive = jobs.some((job) => ACTIVE_STATUSES.includes(job.status));
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(refreshJobs, POLL_MS);
    return () => clearInterval(timer);
  }, [hasActive, refreshJobs]);

  // Seçili işin durumu listede değiştikçe ayrıntısını (metinleri) yeniden çekiyoruz.
  const summary = jobs.find((job) => job.id === selectedId);
  const summaryKey = summary ? `${summary.status}:${summary.progress_current}:${summary.updated_at}` : '';
  useEffect(() => {
    if (selectedId === null) {
      setSelectedJob(null);
      return;
    }
    let cancelled = false;
    getJob(selectedId)
      .then((job) => !cancelled && setSelectedJob(job))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [selectedId, summaryKey]);

  async function handleUploaded(job) {
    await refreshJobs();
    setSelectedId(job.id);
  }

  async function handleRetranslate(id) {
    try {
      await retranslateJob(id);
      await refreshJobs();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(job) {
    if (!window.confirm(`"${job.original_name}" kaydı silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      await deleteJob(job.id);
      if (job.id === selectedId) setSelectedId(null);
      await refreshJobs();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Ses Çevirmeni</h1>
        <p className="muted">İngilizce ses → İngilizce metin → Türkçe çeviri</p>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="layout">
        <HistoryList jobs={jobs} selectedId={selectedId} onSelect={setSelectedId} onDelete={handleDelete} />
        <main className="main">
          <UploadBox onUploaded={handleUploaded} />
          {selectedJob ? (
            <JobDetail job={selectedJob} onRetranslate={handleRetranslate} />
          ) : (
            <p className="muted placeholder">
              Yeni bir dosya yükleyin ya da soldaki listeden önceki bir çeviriyi seçin.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
