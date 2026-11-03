# Dog Bot — entrega para Claude Code

Fecha de corte: 3 de noviembre de 2026.

1. Descomprime este paquete en una carpeta de tu computadora Windows y abre esa carpeta con Claude Code.
2. Abre `PROMPT_DASHBOARD_CLAUDE_CODE.md` y pega su encargo (desde «Actúa como…») en Claude Code.
3. Claude debe leer `CONTEXTO_DOGBOT_CLAUDE_CODE.md` completo e inspeccionar `originales/` y `referencias/` antes de implementar.

El contexto contiene íntegro el dossier fuente, con sus tres códigos, y agrega aclaraciones actuales, revisión del código y especificación del dashboard. No se han modificado ni probado físicamente los sketches originales.

El robot tiene movimientos de dos patas delanteras reportados con soporte. No está demostrado que se sostenga ni camine sin apoyo. La versión 2.0 sigue siendo experimental.

## Contenido

- `CONTEXTO_DOGBOT_CLAUDE_CODE.md`: contexto técnico, historial, correcciones, mediciones, pendientes, revisión de los tres sketches y requisitos completos de la interfaz.
- `PROMPT_DASHBOARD_CLAUDE_CODE.md`: encargo detallado para construir la aplicación Windows con 3D, controles, editor y telemetría.
- `originales/`: los cuatro archivos del ZIP proporcionado, conservados sin cambios.
- `referencias/01-311117.jpg`: diseño del dashboard de referencia.
- `referencias/02-306899.jpg`: robot con cuerpo abierto y electrónica.
- `referencias/03-307335.jpg`: robot con tapa naranja en feria.
- `referencias/04-306788.jpg`: detalle de soportes y articulaciones.
- `referencias/05-305031.jpg`: vista general del robot.
- `INTEGRIDAD_ORIGINALES.json`: hashes SHA-256 de los cuatro archivos fuente.

Los tres archivos .ino son programas independientes, no pestañas de un mismo sketch. Si se abren con Arduino IDE, cada uno debe estar en su propia carpeta de sketch con el mismo nombre base. No cargarlos ni ejecutarlos automáticamente: algunos escriben posiciones o inician una secuencia al encenderse.
