import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(path.join(DATA_DIR, 'app.db'));

export const ACTIVE_STATUSES = ['queued', 'preparing', 'transcribing', 'translating'];

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

export async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name    TEXT    NOT NULL,
      file_size        INTEGER NOT NULL,
      duration_sec     REAL,
      status           TEXT    NOT NULL DEFAULT 'queued',
      progress_current INTEGER NOT NULL DEFAULT 0,
      progress_total   INTEGER NOT NULL DEFAULT 0,
      english_text     TEXT,
      turkish_text     TEXT,
      segments         TEXT,
      error            TEXT,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Cümle eşleşmeleri (segments) sonradan eklendi; eski veritabanlarına sütunu ekle.
  const columns = await all('PRAGMA table_info(jobs)');
  if (!columns.some((column) => column.name === 'segments')) {
    await run('ALTER TABLE jobs ADD COLUMN segments TEXT');
  }

  // Sunucu kapanırken yarıda kalan işler bir daha devam etmez; hata olarak işaretle.
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(', ');
  await run(
    `UPDATE jobs SET status = 'error', error = ?, updated_at = datetime('now')
     WHERE status IN (${placeholders})`,
    ['Sunucu yeniden başlatıldığı için işlem yarıda kaldı.', ...ACTIVE_STATUSES],
  );
}

export async function createJob({ originalName, fileSize }) {
  const result = await run('INSERT INTO jobs (original_name, file_size) VALUES (?, ?)', [
    originalName,
    fileSize,
  ]);
  return getJob(result.lastID);
}

export function updateJob(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((key) => `${key} = ?`).join(', ');
  return run(`UPDATE jobs SET ${sets}, updated_at = datetime('now') WHERE id = ?`, [
    ...keys.map((key) => fields[key]),
    id,
  ]);
}

// segments: [{ en, tr, p }] — İngilizce cümle, Türkçe karşılığı ve paragraf numarası.
export async function getJob(id) {
  const job = await get('SELECT * FROM jobs WHERE id = ?', [id]);
  if (job?.segments) job.segments = JSON.parse(job.segments);
  return job;
}

// Liste ekranı için metinleri göndermiyoruz; uzun kayıtlarda yanıt şişmesin.
export function listJobs() {
  return all(`
    SELECT id, original_name, file_size, duration_sec, status,
           progress_current, progress_total, error, created_at, updated_at
    FROM jobs
    ORDER BY id DESC
  `);
}

export function deleteJob(id) {
  return run('DELETE FROM jobs WHERE id = ?', [id]);
}
