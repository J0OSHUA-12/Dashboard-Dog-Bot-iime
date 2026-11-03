# Pruebas hechas y pruebas físicas pendientes

Fecha: 3 de noviembre de 2026. Todo se desarrolló y comprobó en un entorno Linux en la nube,
**sin el robot, sin Arduino y sin Windows**.

## Comprobaciones realizadas (software)

| # | Comprobación | Cómo | Resultado |
|---|---|---|---|
| 1 | Tipos TypeScript (interfaz, servicio, núcleo, pruebas) | `npm run typecheck` | Sin errores |
| 2 | Pruebas automáticas | `npm test` (Vitest, 66 pruebas) | Todas pasan |
| 3 | Firmware compila para ATmega328P | avr-gcc 7.3 + ArduinoCore-avr 1.8.x + Adafruit PWM 3.0.3 + BusIO, `-Wall -Wextra` | 13 920 B flash (42,5 %), 838 B RAM estática (40,9 %), sin advertencias |
| 4 | Los tres sketches originales compilan (sin modificarse) | Mismo toolchain | Compilan; hashes SHA-256 iguales a `INTEGRIDAD_ORIGINALES.json` |
| 5 | Firmware real ejecutado en la PC (arnés) | `tests/firmware.host.test.ts` | Arranque sin movimiento, rechazos (`STATE`, `ORDER`, `CHANNEL`, `RANGE`, `NOLIMIT`, `DISABLED`, `UNKNOWN`, `SYNTAX`, `ARGS`), STOP a mitad de trayectoria, slew, modo CAL, pérdida de enlace HOLD y OFF, heartbeat, desbordamiento, bytes corruptos, OFF y DISARM |
| 6 | Cliente de protocolo con **firmware simulado** | `tests/protocolClient.test.ts` | Solo identifica al conectar; consolida 300 movimientos de slider en ≤ 2 órdenes; STOP y OFF con prioridad; reinicio → desarmado sin reenvío; reconexión sin reproducir consignas; firmware ya armado → STOP sin cortar PWM; líneas corruptas; timeouts → fallo; heartbeat |
| 7 | Perfiles | `tests/profile.test.ts` | Guardar y recuperar sin pérdida; rechazo de JSON inválido, versión, duplicados, canales 12–15, límites desordenados, calibrado incompleto; perfil desconocido o sin calibrar no habilita movimiento coordinado |
| 8 | Compilación y carga con **Arduino CLI simulado** | `tests/service.test.ts` | Instantánea en carpeta válida con espacios en la ruta; error de compilación impide subir; editar → obsoleta; placa distinta → bloqueo; upload con `--input-dir` sin recompilar; liberación y reapertura del COM; diagnóstico de puerto ocupado; una operación a la vez |
| 9 | Puerto serie simulado, rutas y seguridad | `tests/service.test.ts` | Cola corta con prioridad; ensamblado de líneas; validación de COM y baudios; originales protegidos; nombres reservados de Windows; Host, Origin y token |
| 10 | Modelo 3D | `tests/model.test.ts` | Los 12 controles giran solo su pivote; la rodilla gira sobre su eje; abducción hacia afuera en ambos lados; signos de los canales 0, 1 y 2 según el dossier; la fórmula de la secuencia fluida coincide con el sketch y respeta límites |
| 11 | Flujo completo ROBOT REAL con **puerto virtual** | socat (PTY) ↔ firmware ejecutado en la PC ↔ servicio ↔ navegador (Playwright) | Conectar → `Compatible · desarmado` → armar en calibración → habilitar canal 1 → pasos hasta 1600 µs con `PW` reales → DETENER (Esc) → PWM OFF (0 canales). Sin errores de consola |
| 12 | Revisión visual | Capturas con Chromium a 1366×768, 1920×1080 y 390×844 | Paneles sin solaparse con controles ni registros; pestañas inferiores en ventanas estrechas |

## Pruebas físicas pendientes (no realizadas)

Hazlas en orden, con el robot **sostenido** y anotando cada una en *Registro de ensayos*:

1. **Instalación en Windows**: `INSTALAR_DOGBOT.bat` e `INICIAR_DOGBOT.bat`. La app abre en
   simulación.
2. **Arduino CLI real**: diagnóstico, core y biblioteca; compilar `DogBotDashboard` y comparar
   el tamaño.
3. **USB/COM**: listar puertos, conectar, diagnóstico con el Monitor Serie abierto y reinicio
   del UNO al abrir el puerto.
4. **Carga física** del firmware nuevo y reidentificación automática después de subir.
5. **Arranque del firmware con el PCA9685 alimentado**: confirmar que ningún servo se mueve al
   arrancar ni al conectar.
6. **Canal 1 aislado**: armar en calibración, habilitar en un pulso revisado y explorar en
   pasos pequeños. Comprobar DETENER, PWM OFF canal y desarmar.
7. **Pérdida de enlace**: desconectar el USB con un canal habilitado y observar HOLD y luego
   OFF.
8. **Calibrar 0, 1, 2 y después 3, 4, 5.** Confirmar los sentidos de la pata 2 (espejo
   hipotético).
9. **Secuencia «Ensayo suspendido · delanteras»** con perfil calibrado y amplitud baja.
10. **Mediciones** de tensión y corriente con instrumento externo, registradas aparte.

Hasta completar estas pruebas: **no se afirma** que la app funcione en Windows, que el
firmware nuevo controle el robot, ni que el Dog Bot se sostenga o camine.
