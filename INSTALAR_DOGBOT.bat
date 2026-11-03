@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  === Dog Bot Control: instalacion (solo la primera vez o tras actualizar) ===
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Falta Node.js. Instala Node.js 22 LTS o 24 LTS desde https://nodejs.org
  echo  y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)"
if errorlevel 1 (
  echo  Se requiere Node.js 22.12 o superior. Version actual:
  node -v
  pause
  exit /b 1
)
echo  Instalando dependencias exactas (package-lock.json)...
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo  Error instalando dependencias. Revisa la conexion a Internet y vuelve a intentar.
  pause
  exit /b 1
)
echo  Compilando interfaz y servicio...
call npm run build
if errorlevel 1 (
  echo  Error al compilar. Copia el mensaje anterior para revisarlo.
  pause
  exit /b 1
)
echo.
echo  Listo. Ahora ejecuta INICIAR_DOGBOT.bat
echo  (Para compilar/subir sketches necesitas Arduino IDE 2 o arduino-cli instalado.)
echo.
pause
