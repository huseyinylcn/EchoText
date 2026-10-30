export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export const ACTIVE_STATUSES = ['queued', 'preparing', 'transcribing', 'translating'];

async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `İstek başarısız (${res.status}).`);
  return data;
}

export const listJobs = () => request('/api/jobs');

export const getJob = (id) => request(`/api/jobs/${id}`);

export const deleteJob = (id) => request(`/api/jobs/${id}`, { method: 'DELETE' });

export const retranslateJob = (id) => request(`/api/jobs/${id}/translate`, { method: 'POST' });

// fetch yükleme ilerlemesini bildirmediği için XMLHttpRequest kullanıyoruz.
export function uploadAudio(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/jobs');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Yanıt JSON değilse aşağıda genel hata mesajı gösterilir.
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.error || `Yükleme başarısız (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun.'));

    const form = new FormData();
    form.append('audio', file);
    xhr.send(form);
  });
}
