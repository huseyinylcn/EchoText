import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import OpenAI from 'openai';
import { prepareParts, probeAudio, splitInHalf } from './audio.js';
import { getJob, updateJob } from './db.js';

const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const TRANSLATE_MODEL = process.env.TRANSLATE_MODEL || 'gpt-4.1-mini';

// Çeviri isteği başına İngilizce metin sınırı (karakter).
const TRANSLATE_BATCH_CHARS = 4000;

// Ekranda cümleler bu uzunluğa ulaşınca yeni paragrafa geçilir (karakter).
const PARAGRAPH_CHARS = 450;

// Model bazen kendini tekrar eden bir döngüye girip çıktı sınırına (~2000 token) kadar
// yazıyor. Süreye göre makul olmayan uzunlukta (≈270 kelime/dk üstü) ya da sınıra
// dayanmış bir sonuç gelirse parçayı ikiye bölüp yeniden deniyoruz.
const MAX_CHARS_PER_SECOND = 25;
const OUTPUT_TOKEN_LIMIT_GUARD = 1900;
const MIN_SPLIT_SECONDS = 60;

const TRANSLATE_INSTRUCTIONS = `You are a professional English-to-Turkish translator.
You receive consecutive sentences from an English speech transcript as a JSON array of {id, text}.
Translate every sentence into fluent, natural Turkish, using the neighbouring sentences as context.
Return exactly one translation per input id, in the same order.
Never merge, split, skip or reorder sentences, and do not add anything.`;

const TRANSLATION_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'translations',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        translations: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'integer' }, text: { type: 'string' } },
            required: ['id', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['translations'],
      additionalProperties: false,
    },
  },
};

let client;
function openai() {
  client ??= new OpenAI({ maxRetries: 4, timeout: 10 * 60 * 1000 });
  return client;
}

async function transcribe(filePath, workDir) {
  const result = await openai().audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: TRANSCRIBE_MODEL,
    language: 'en',
    response_format: 'json',
  });
  const text = result.text.trim();

  const { duration } = await probeAudio(filePath);
  const suspicious =
    text.length > duration * MAX_CHARS_PER_SECOND ||
    (result.usage?.output_tokens ?? 0) >= OUTPUT_TOKEN_LIMIT_GUARD;
  if (!suspicious || duration < MIN_SPLIT_SECONDS) return text;

  console.warn(
    `[döküm] ${path.basename(filePath)}: ${duration.toFixed(0)} sn için ${text.length} karakter geldi; ikiye bölünüp yeniden deneniyor.`,
  );
  const texts = [];
  for (const half of await splitInHalf(filePath, duration, workDir)) {
    texts.push(await transcribe(half, workDir));
  }
  return texts.filter(Boolean).join(' ');
}

// Cümleleri tek istekte çevirir; dönen dizi girişle birebir aynı sırada ve uzunlukta olur.
async function translateSentences(sentences) {
  const result = await openai().chat.completions.create({
    model: TRANSLATE_MODEL,
    response_format: TRANSLATION_FORMAT,
    messages: [
      { role: 'system', content: TRANSLATE_INSTRUCTIONS },
      { role: 'user', content: JSON.stringify(sentences.map((text, id) => ({ id, text }))) },
    ],
  });

  let translations = [];
  try {
    translations = JSON.parse(result.choices[0].message.content).translations;
  } catch {
    // Yanıt kesildiyse ya da okunamadıysa aşağıda yarıya bölerek yeniden deneriz.
  }

  const byId = new Map(translations.map(({ id, text }) => [id, text.trim()]));
  if (sentences.every((_, id) => byId.has(id))) return sentences.map((_, id) => byId.get(id));

  if (sentences.length === 1) {
    if (!translations.length) throw new Error('Çeviri modelinin yanıtı okunamadı.');
    return [translations.map(({ text }) => text.trim()).join(' ')];
  }

  // Model cümle eşleşmesini bozduysa daha küçük gruplarla yeniden deniyoruz.
  const middle = Math.ceil(sentences.length / 2);
  return [
    ...(await translateSentences(sentences.slice(0, middle))),
    ...(await translateSentences(sentences.slice(middle))),
  ];
}

function buildSegments(english) {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const segments = [];
  let paragraph = 0;
  let paragraphLength = 0;
  for (const { segment } of segmenter.segment(english)) {
    const en = segment.trim();
    if (!en) continue;
    if (paragraphLength >= PARAGRAPH_CHARS) {
      paragraph++;
      paragraphLength = 0;
    }
    segments.push({ en, tr: null, p: paragraph });
    paragraphLength += en.length;
  }
  return segments;
}

function batchSegments(segments, maxChars) {
  const batches = [];
  let current = [];
  let length = 0;
  for (const segment of segments) {
    if (current.length && length + segment.en.length > maxChars) {
      batches.push(current);
      current = [];
      length = 0;
    }
    current.push(segment);
    length += segment.en.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

function joinParagraphs(segments, key) {
  const paragraphs = [];
  for (const segment of segments) (paragraphs[segment.p] ??= []).push(segment[key]);
  return paragraphs.map((sentences) => sentences.join(' ')).join('\n\n');
}

/**
 * İngilizce metni cümle cümle Türkçeye çevirir. Daha önce yarıda kalmış bir çeviri
 * varsa (existingSegments) yalnızca çevrilmemiş cümleler için istek atılır.
 */
async function translateTranscript(jobId, english, existingSegments) {
  const segments = existingSegments ?? buildSegments(english);
  const batches = batchSegments(
    segments.filter((segment) => segment.tr == null),
    TRANSLATE_BATCH_CHARS,
  );
  await updateJob(jobId, {
    status: 'translating',
    progress_current: 0,
    progress_total: batches.length,
    segments: JSON.stringify(segments),
  });

  for (let i = 0; i < batches.length; i++) {
    const translations = await translateSentences(batches[i].map((segment) => segment.en));
    batches[i].forEach((segment, j) => {
      segment.tr = translations[j];
    });
    // Her gruptan sonra kaydediyoruz; ekranda çeviri ilerledikçe görünür.
    await updateJob(jobId, { segments: JSON.stringify(segments), progress_current: i + 1 });
  }

  // Düz Türkçe metni (kopyalama/indirme için) yalnızca çeviri tamamlanınca yazıyoruz;
  // böylece yarıda kalan bir yeniden çeviri, önceki tam çeviriyi silmez.
  await updateJob(jobId, { turkish_text: joinParagraphs(segments, 'tr') });
}

function describeError(err) {
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401) return 'OpenAI API anahtarı geçersiz (401).';
    if (err.status === 429) return `OpenAI kota/hız sınırına takıldı (429): ${err.message}`;
    return `OpenAI hatası (${err.status ?? 'bağlantı'}): ${err.message}`;
  }
  return err.message || String(err);
}

async function failJob(jobId, err) {
  console.error(`[iş ${jobId}]`, err);
  await updateJob(jobId, { status: 'error', error: describeError(err) });
}

export async function processJob(jobId, filePath) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ravza-parts-'));
  try {
    await updateJob(jobId, { status: 'preparing' });
    const info = await probeAudio(filePath);
    await updateJob(jobId, { duration_sec: info.duration });

    const parts = await prepareParts(filePath, info, workDir);
    await updateJob(jobId, { status: 'transcribing', progress_current: 0, progress_total: parts.length });

    let english = '';
    for (let i = 0; i < parts.length; i++) {
      const text = await transcribe(parts[i], workDir);
      if (text) english = english ? `${english} ${text}` : text;
      // Her parçadan sonra kaydediyoruz; çeviri aşamasında hata olsa da İngilizce metin kaybolmaz.
      await updateJob(jobId, { english_text: english, progress_current: i + 1 });
    }
    if (!english) throw new Error('Ses dosyasında konuşma algılanamadı.');

    await translateTranscript(jobId, english, null);
    await updateJob(jobId, { status: 'done' });
  } catch (err) {
    await failJob(jobId, err);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.rmSync(filePath, { force: true });
  }
}

// Sesi yeniden işlemeden yalnızca çeviriyi yapar: eski kayıtlar için cümle eşleşmesi
// oluşturur ya da yarıda kalmış bir çeviriyi tamamlar.
export async function retranslateJob(jobId) {
  try {
    const job = await getJob(jobId);
    await translateTranscript(jobId, job.english_text, job.segments);
    await updateJob(jobId, { status: 'done' });
  } catch (err) {
    await failJob(jobId, err);
  }
}
