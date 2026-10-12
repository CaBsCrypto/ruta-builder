# Validación de Ruta Builder · 11 de octubre de 2026

Implementación local con React/Vite, Express y SQLite. Resultados observados, sin llamadas reales a OpenAI ni compras en cadena.

## Comprobaciones ejecutadas

- `npm run typecheck`: backend, interfaz y pruebas wallet sin errores.
- `npm run build`: bundle de producción generado; wallet/x402 compila para navegador sin importar el ledger Node del comprador.
- `npm test`: **113 pruebas** correctas. Incluyen los 44 casos originales y nuevos casos de lector, motor, SQLite, servidor, interfaz de firma y demo pública. La convocatoria objetivo conserva Encode sin inventar evidencia; trece casos adicionales comprueban el transporte sin red, persistencia local, catálogo histórico, límites e informes válidos antes del desbloqueo simulado.
- `npm run coach:smoke`: comprador A obtiene el informe nuevo mediante HTTP 402 y facilitador fixture; duplicados comparten recibo, una liquidación simulada y descarga posterior sin otra liquidación. Guarda `output/coach-smoke.json`.
- `npm run research:check`: integridad del inventario histórico, enlaces, tipos y fechas. Es una validación local, no una reconfirmación online de todos los programas.

Los casos nuevos comprueban SSRF, DNS y redirects, credenciales, límites, commit fijo, cobertura parcial, README malicioso, dependencias sin integración acreditada, fichas cerradas/pausadas/vencidas, referencias y números sin respaldo, salida incompleta, límite IA persistente, propietario de sesión y reportes inmutables. También verifican concurrencia, pérdida de respuesta, recibos durables y reinicios sin otra liquidación. El modo conectado utiliza transporte inyectado en pruebas; no consume API real.

## Lectura pública real

Repositorio `solana-foundation/developer-content`, commit `97a223daedfb5c3b696b709e1a9246a861f2141b`: **30 documentos, 66 evidencias, 33 solicitudes HTTPS y 509.799 bytes**, aproximadamente 6,23 segundos. Sin fallos de lectura. Cobertura parcial declarada: 388 textos fuera del límite, 195 archivos excluidos y web no aportada. Resumen sin textos completos en `output/coach-public-scan.json`. No se ejecutó código del repositorio.

La lectura demuestra conectividad y extracción limitada; no certifica calidad de una postulación ni que ese repositorio haya solicitado ayuda. Los tres ejemplos dentro de la aplicación son sintéticos y están marcados como fixtures.

## Navegador

Flujo completo con GrantFlow y Wallet Alerts: perfil, fuentes, diagnóstico, oportunidad, preparación, pago simulado e informe. Recuperación de proyecto y acceso pagado tras recargar; presupuesto editado conserva etiqueta de edición humana y la descarga Markdown incluye esa copia. El JSON original permanece intacto.

Evidencia muestra archivo/línea, commit y fecha; Escape devuelve el foco. Responsive a 390×844 sin desbordamiento. Consola sin errores/advertencias de aplicación. Captura: `output/coach-ui/report.png`. Se reinició el servidor y se comprobó nuevamente la recuperación desde SQLite.

## Demo pública

El build `npm run build:public` produce una aplicación estática con datos en el navegador, sin lector externo, OpenAI, wallets ni liquidación. El recorrido de ejemplo se verificó en preview: selección de Encode, diagnóstico, informe gratuito, edición y recuperación tras recargar, sin errores de consola. El bundle no contiene llamadas fetch ni módulos de firma Solana. El backend completo y su recuperación SQLite se reproducen localmente; la demo estática no se presenta como una liquidación HTTP x402 real.

## Pendientes materiales

Autodiagnóstico de Ruta Builder para Encode: perfil real en modo declarativo, sin web ni repositorio público propios, cobertura parcial e informe mediante plantilla determinista y pago simulado. Se preparó una copia editable de ocho secciones con trabajo previo y pendientes explícitos. Exportaciones en `output/encode-ruta-builder/`. Esta prueba no equivale a lectura automática de nuestro código ni a inscripción o envío a Encode.

La generación real con `OPENAI_API_KEY`, firma de una wallet y liquidación x402 en devnet no se han ejecutado. **La compra real sigue pendiente por instrucción del usuario**. 0,01 USDC corresponde a tokens de prueba. No hay evidencia de rentabilidad ni disposición a pagar.

El bloqueo de pagos inciertos es conservador; todavía falta una herramienta operativa de conciliación. El servidor completo escucha en loopback; su despliegue persistente, protección de abuso entre sesiones, pruebas con dos builders, inscripción, video y entrega a Encode siguen pendientes. La demo pública estática es un recorrido separado, sin servicio de pago. La documentación conserva el calendario sin afirmar que estas tareas ya ocurrieron.
