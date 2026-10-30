import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');

// Roboto Türkçe karakterleri (ş, ğ, ı, İ…) içerir; pdfmake paketiyle birlikte gelir.
const FONT_DIR = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');

pdfmake.setFonts({
  Roboto: {
    normal: path.join(FONT_DIR, 'Roboto-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Roboto-Medium.ttf'),
    italics: path.join(FONT_DIR, 'Roboto-Italic.ttf'),
    bolditalics: path.join(FONT_DIR, 'Roboto-MediumItalic.ttf'),
  },
});
// PDF'e yalnızca yukarıdaki yazı tipleri girer; başka dosya ya da adres okunmaz.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((filePath) => path.resolve(filePath).startsWith(FONT_DIR));

const COLORS = {
  text: '#1c2128',
  muted: '#687280',
  border: '#d5d9df',
  headerFill: '#eef1f5',
};

const PARAGRAPH_CHARS = 450;

// Yazı tipinde emoji yok; dosya adındaki emojiler PDF'te boş kutu olarak çıkmasın.
function cleanTitle(fileName) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function pdfFileName(job) {
  return `${cleanTitle(job.original_name) || 'ceviri'} - EN-TR.pdf`;
}

function formatDuration(seconds) {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function formatDate(sqliteDate) {
  return new Date(`${sqliteDate.replace(' ', 'T')}Z`).toLocaleString('tr-TR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

// Satır sonu olmayan uzun dökümleri cümle sınırlarından paragraflara böler.
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

function paragraphStack(paragraphs) {
  return { stack: paragraphs.map((text) => ({ text, margin: [0, 0, 0, 6] })) };
}

// Webdeki görünümle aynı: her satırda bir paragrafın İngilizcesi solda, Türkçesi sağda.
function tableRows(job) {
  if (job.segments?.length) {
    const paragraphs = [];
    for (const { en, tr, p } of job.segments) {
      const paragraph = (paragraphs[p] ??= { en: [], tr: [] });
      paragraph.en.push(en);
      paragraph.tr.push(tr ?? '…');
    }
    return paragraphs.filter(Boolean).map(({ en, tr }) => [en.join(' '), tr.join(' ')]);
  }

  // Eski kayıtlarda cümle eşleşmesi yok; iki metin tek satırda yan yana durur.
  return [
    [
      paragraphStack(toParagraphs(job.english_text)),
      job.turkish_text
        ? paragraphStack(toParagraphs(job.turkish_text))
        : { text: 'Çeviri yok.', color: COLORS.muted },
    ],
  ];
}

export function buildPdf(job) {
  const title = cleanTitle(job.original_name);
  const meta = [formatDate(job.created_at), job.duration_sec != null && formatDuration(job.duration_sec)]
    .filter(Boolean)
    .join(' · ');

  const doc = {
    pageSize: 'A4',
    pageMargins: [40, 48, 40, 48],
    info: { title, creator: 'Ses Çevirmeni' },
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.3, color: COLORS.text },
    footer: (page, pageCount) => ({
      text: `${page} / ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: COLORS.muted,
      margin: [0, 18, 0, 0],
    }),
    content: [
      { text: title, fontSize: 15, bold: true, margin: [0, 0, 0, 4] },
      { text: meta, fontSize: 9, color: COLORS.muted, margin: [0, 0, 0, 14] },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*'],
          body: [
            [
              { text: 'İngilizce (orijinal)', bold: true, fontSize: 9, color: COLORS.muted },
              { text: 'Türkçe', bold: true, fontSize: 9, color: COLORS.muted },
            ],
            ...tableRows(job),
          ],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => COLORS.border,
          vLineColor: () => COLORS.border,
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          fillColor: (rowIndex) => (rowIndex === 0 ? COLORS.headerFill : null),
        },
      },
    ],
  };

  return pdfmake.createPdf(doc).getBuffer();
}
