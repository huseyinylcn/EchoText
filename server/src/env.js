import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Proje kökündeki .env dosyasını yükler. Diğer modüllerden önce import edilmeli.
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'),
  quiet: true,
});
