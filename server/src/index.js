import './env.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { ACTIVE_STATUSES, createJob, deleteJob, getJob, initDb, listJobs, updateJob } from './db.js';
import { buildPdf, pdfFileName } from './pdf.js';
import { processJob, retranslateJob } from './pipeline.js';

const PORT = Number(process.env.PORT) || 3001;
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const UPLOAD_DIR = path.join(os.tmpdir(), 'ravza-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // Uzantıyı koruyoruz; OpenAI ve ffmpeg dosya türünü buradan anlıyor.
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

// Multer dosya adını latin1 olarak çözüyor; Türkçe karakterler bozulmasın diye UTF-8'e çeviriyoruz.
function decodeFileName(name) {
  if ([...name].some((ch) => ch.charCodeAt(0) > 0xff)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

// İşleri sırayla çalıştırıyoruz; aynı anda yüklenen dosyalar OpenAI hız sınırına takılmasın.
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task);
}

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Geçersiz kayıt numarası.' });
    return null;
  }
  return id;
}

const app = express();

app.get('/api/jobs', async (req, res) => {
  res.json(await listJobs());
});

app.get('/api/jobs/:id', async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const job = await getJob(id);
  if (!job) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
  res.json(job);
});

app.post('/api/jobs', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Ses dosyası gönderilmedi.' });
  if (!process.env.OPENAI_API_KEY) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(500).json({ error: 'Sunucuda OPENAI_API_KEY tanımlı değil (.env dosyasını kontrol edin).' });
  }

  const job = await createJob({
    originalName: decodeFileName(req.file.originalname),
    fileSize: req.file.size,
  });
  enqueue(() => processJob(job.id, req.file.path));
  res.status(201).json(job);
});

// İngilizce (sol) ve Türkçe (sağ) metni yan yana içeren PDF.
app.get('/api/jobs/:id/pdf', async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const job = await getJob(id);
  if (!job) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
  if (!job.english_text) return res.status(400).json({ error: 'Bu kayıtta henüz metin yok.' });

  const pdf = await buildPdf(job);
  res.attachment(pdfFileName(job));
  res.send(pdf);
});

// Sesi yeniden işlemeden çeviriyi (cümle eşleşmeli olarak) yeniden yapar ya da tamamlar.
app.post('/api/jobs/:id/translate', async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const job = await getJob(id);
  if (!job) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
  if (ACTIVE_STATUSES.includes(job.status)) {
    return res.status(409).json({ error: 'Bu kayıt zaten işleniyor.' });
  }
  if (!job.english_text) {
    return res.status(400).json({ error: 'Bu kayıtta çevrilecek İngilizce metin yok; dosyayı yeniden yükleyin.' });
  }

  await updateJob(id, { status: 'queued', error: null, progress_current: 0, progress_total: 0 });
  enqueue(() => retranslateJob(id));
  res.status(202).json(await getJob(id));
});

app.delete('/api/jobs/:id', async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const job = await getJob(id);
  if (!job) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
  if (ACTIVE_STATUSES.includes(job.status)) {
    return res.status(409).json({ error: 'İşlem devam ederken kayıt silinemez.' });
  }
  await deleteJob(id);
  res.status(204).end();
});

// `npm run build` ile derlenmiş arayüz varsa onu da sunar (tek port ile kullanım için).
if (fs.existsSync(CLIENT_DIST)) app.use(express.static(CLIENT_DIST));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Dosya çok büyük (en fazla ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` });
  }
  console.error(err);
  res.status(500).json({ error: err.message || 'Sunucu hatası.' });
});

await initDb();
app.listen(PORT, () => {
  console.log(`Sunucu hazır: http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) console.warn('UYARI: OPENAI_API_KEY bulunamadı.');
});
