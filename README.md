# EchoText

İngilizce ses ve video dosyalarını yazıya döker, cümle cümle Türkçeye çevirir. İngilizce metin ile Türkçe çeviri yan yana gösterilir; sonuçlar kaydedilir ve PDF olarak indirilebilir. Yazıya dökme ve çeviri için OpenAI API kullanılır.

## Gereksinimler

- [Node.js](https://nodejs.org)
- OpenAI API anahtarı

## Kurulum

1. `kurulum.bat` dosyasına çift tıklayın. Paketleri kurar ve `.env` dosyasını oluşturur.
2. `.env` dosyasını açıp `OPENAI_API_KEY=` satırına API anahtarınızı yazın.

## Kullanım

1. `baslat.bat` dosyasına çift tıklayın. Tarayıcıda http://localhost:5173 açılır.
2. Ses dosyasını sayfaya sürükleyin ya da tıklayıp seçin (mp3, m4a, wav, mp4… en fazla 500 MB).
3. İşlem bitince metni kopyalayabilir, `.txt` ya da yan yana PDF olarak indirebilirsiniz. Önceki çeviriler soldaki listede durur.

Uygulamayı kapatmak için `baslat.bat` penceresini kapatın.

Windows dışındaki sistemlerde: `npm run install:all` ile kurun, `npm run dev` ile başlatın.

## Ayarlar

`.env` dosyasındaki değerler:

| Değişken | Açıklama | Varsayılan |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI API anahtarı (zorunlu) | — |
| `TRANSCRIBE_MODEL` | Yazıya dökme modeli | `gpt-4o-mini-transcribe` |
| `TRANSLATE_MODEL` | Çeviri modeli | `gpt-4.1-mini` |
| `PORT` | Sunucu portu | `3001` |
