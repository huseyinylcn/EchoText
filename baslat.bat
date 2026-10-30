@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules goto kurulum_yok
if not exist server\node_modules goto kurulum_yok
if not exist client\node_modules goto kurulum_yok

if not exist .env (
  echo .env dosyası bulunamadı. Önce kurulum.bat dosyasını çalıştırın.
  pause
  exit /b 1
)

echo Uygulama başlatılıyor. Kapatmak için bu pencereyi kapatın.
start "" cmd /c "timeout /t 5 >nul & start http://localhost:5173"
call npm run dev
pause
exit /b

:kurulum_yok
echo Paketler kurulu değil. Önce kurulum.bat dosyasını çalıştırın.
pause
exit /b 1
