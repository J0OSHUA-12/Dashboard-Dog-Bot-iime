@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "dist\service\index.js" (
  echo  Primero ejecuta INSTALAR_DOGBOT.bat
  pause
  exit /b 1
)
echo.
echo  Iniciando Dog Bot Control. El navegador se abrira en http://127.0.0.1:5178
echo  Iniciar la aplicacion NO mueve el robot ni carga firmware.
echo  Para cerrar: boton Cerrar de la aplicacion, cierra esta ventana o pulsa Ctrl+C.
echo.
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:5178"
node dist\service\index.js
rem Cierre normal (boton Cerrar): la ventana se cierra sola. Si hubo error, se queda abierta.
if errorlevel 1 pause
