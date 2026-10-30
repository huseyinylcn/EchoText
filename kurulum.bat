@echo off
chcp 65001 >nul
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadı. https://nodejs.org adresinden kurup tekrar deneyin.
  pause
  exit /b 1
)

echo Paketler kuruluyor...
call npm run install:all
if errorlevel 1 (
  echo.
  echo Kurulum sırasında hata oluştu.
  pause
  exit /b 1
)

if not exist .env (
  copy .env.example .env >nul
  echo.
  echo .env dosyası oluşturuldu. İçine OpenAI API anahtarınızı yazın.
)

echo.
echo Kurulum tamamlandı. Uygulamayı başlatmak için baslat.bat dosyasını çalıştırın.
pause
