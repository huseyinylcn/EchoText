import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

// OpenAI transcriptions endpoint'inin dosya sınırı 25 MB; biraz pay bırakıyoruz.
const DIRECT_MAX_BYTES = 24 * 1024 * 1024;

// gpt-4o-mini-transcribe'ın çıktı token sınırı düşük olduğu için uzun konuşmalar
// tek parçada kesilebilir. ~5 dakikalık parçalar bu sınırın rahatça altında kalır.
export const CHUNK_SECONDS = 300;

// Parçayı hedef sürenin en az bu oranından sonraki bir sessizlikten kesmeye çalışırız.
const MIN_CHUNK_RATIO = 0.75;

const SUPPORTED_EXTENSIONS = new Set([
  '.flac', '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.ogg', '.wav', '.webm',
]);

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', ...args], { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stderr }));
  });
}

function parseTimestamp(value) {
  const [h, m, s] = value.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

export async function probeAudio(filePath) {
  const { stderr } = await runFfmpeg(['-i', filePath]);
  if (!/Stream #.*Audio:/.test(stderr)) {
    throw new Error('Dosyada okunabilir bir ses kanalı bulunamadı.');
  }

  let duration = null;
  const match = stderr.match(/Duration: (\d+:\d+:\d+(?:\.\d+)?)/);
  if (match) {
    duration = parseTimestamp(match[1]);
  } else {
    // Bazı webm/ogg dosyalarında başlıkta süre yok; dosyayı çözerek ölçüyoruz.
    const decoded = await runFfmpeg(['-i', filePath, '-vn', '-f', 'null', '-']);
    const times = [...decoded.stderr.matchAll(/time=(\d+:\d+:\d+(?:\.\d+)?)/g)];
    if (times.length) duration = parseTimestamp(times.at(-1)[1]);
  }
  if (!duration) throw new Error('Ses dosyasının süresi okunamadı.');

  const { size } = await fs.stat(filePath);
  return { duration, size };
}

async function findSilenceMidpoints(filePath) {
  const { stderr } = await runFfmpeg([
    '-nostats', '-i', filePath, '-vn',
    '-af', 'silencedetect=noise=-35dB:d=0.4',
    '-f', 'null', '-',
  ]);
  return [...stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map(
    ([, end, length]) => Number(end) - Number(length) / 2,
  );
}

async function findCutPoints(filePath, duration) {
  if (duration <= CHUNK_SECONDS) return [];

  const silences = await findSilenceMidpoints(filePath);
  const cuts = [];
  let last = 0;
  while (duration - last > CHUNK_SECONDS) {
    const target = last + CHUNK_SECONDS;
    const earliest = last + CHUNK_SECONDS * MIN_CHUNK_RATIO;
    const candidates = silences.filter((t) => t > earliest && t <= target);
    const cut = candidates.length ? candidates.at(-1) : target;
    cuts.push(cut);
    last = cut;
  }
  return cuts;
}

function mp3EncodeArgs(input) {
  return ['-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k'];
}

async function encodeMp3(args) {
  const { code, stderr } = await runFfmpeg(args);
  if (code !== 0) {
    throw new Error(`Ses dosyası bölünemedi: ${stderr.trim().split('\n').at(-1)}`);
  }
}

/**
 * Bir parçayı ortasına en yakın sessizlikten (yoksa tam ortasından) ikiye böler.
 */
export async function splitInHalf(filePath, duration, workDir) {
  const middle = duration / 2;
  const nearMiddle = (await findSilenceMidpoints(filePath)).filter(
    (t) => Math.abs(t - middle) < duration * 0.2,
  );
  const cut = nearMiddle.length
    ? nearMiddle.reduce((best, t) => (Math.abs(t - middle) < Math.abs(best - middle) ? t : best))
    : middle;

  const base = path.join(workDir, path.basename(filePath, path.extname(filePath)));
  const first = `${base}a.mp3`;
  const second = `${base}b.mp3`;
  await encodeMp3([...mp3EncodeArgs(filePath), '-t', cut.toFixed(3), first]);
  await encodeMp3(['-ss', cut.toFixed(3), ...mp3EncodeArgs(filePath), second]);
  return [first, second];
}

/**
 * Dosyayı modele gönderilecek parçalara ayırır ve parça yollarını sırayla döner.
 * Küçük ve desteklenen formattaki dosyalar olduğu gibi gönderilir; diğerleri
 * mono 16 kHz MP3'e çevrilip sessiz noktalardan bölünür.
 */
export async function prepareParts(filePath, { duration, size }, workDir) {
  const ext = path.extname(filePath).toLowerCase();
  if (size <= DIRECT_MAX_BYTES && duration <= CHUNK_SECONDS && SUPPORTED_EXTENSIONS.has(ext)) {
    return [filePath];
  }

  const cuts = await findCutPoints(filePath, duration);
  await encodeMp3(
    cuts.length
      ? [
          ...mp3EncodeArgs(filePath),
          '-f', 'segment',
          '-segment_times', cuts.map((t) => t.toFixed(3)).join(','),
          '-reset_timestamps', '1',
          path.join(workDir, 'part_%03d.mp3'),
        ]
      : [...mp3EncodeArgs(filePath), path.join(workDir, 'part_000.mp3')],
  );

  const parts = (await fs.readdir(workDir))
    .filter((name) => /^part_\d+\.mp3$/.test(name))
    .sort()
    .map((name) => path.join(workDir, name));
  if (!parts.length) throw new Error('Ses dosyasından parça üretilemedi.');
  return parts;
}
