# MVP: acompañante de proyectos y postulaciones

Ruta Builder reemplaza las rendiciones como primer producto para Encode. La segunda etapa reutilizará [el prototipo de rendiciones](microgrant-renditions.md) cuando exista una comunidad financiadora. Este MVP orienta al builder; no adjudica grants ni presenta postulaciones.

## Recorrido

Conversación guiada sobre proyecto, audiencia, etapa y redes actual/objetivo → web y GitHub opcionales → revisar evidencias y completar equipo, licencia, usuarios, país, presupuesto e hitos → elegir oportunidad → preparar informe → obtener diagnóstico, plan y borrador editable.

Una idea sin fuentes permanece declarativa y con cobertura parcial. La sesión privada permite retomar. React/Vite, Express y SQLite conservan diagnósticos, versiones, intentos IA y recibos. No hay organizaciones ni panel de financiadores.

## Evidencia y límites

Tres páginas del mismo sitio, 30 archivos públicos GitHub fijados a commit, 48 solicitudes, 256 KiB por respuesta, 3 MiB y 30 segundos. HTTPS con DNS fijado, revalidación de redirects y bloqueo de destinos privados; omisión/redacción de credenciales. No instala ni ejecuta el código. Sitios que requieren autenticación o JavaScript pueden quedar sin cobertura.

Cada evidencia distingue observado, declarado o inferido, con fecha, URL y archivo/línea/commit cuando corresponde. README es contenido observado, sin acreditar lo que afirma su autor. Dependencias e imports no demuestran integraciones funcionando. Consumo y costes reales siguen desconocidos salvo declaraciones.

El catálogo separa apoyo, estado, deadline, fuente y fecha. Excluye fichas vencidas, pausadas, cerradas, no verificadas o de más de 14 días. Condiciones de texto libre requieren revisión humana; el organizador confirma elegibilidad. Otros ecosistemas devuelven cobertura no disponible.

El builder puede indicar una convocatoria objetivo opcional. Si sigue disponible y compatible se incluye entre las tres recomendaciones, sin cambiar sus requisitos pendientes. No se completan equipo, licencia o presupuesto para forzar el orden. `GET /api/opportunities` lista nombres verificados para el selector; `preferredOpportunityId` se conserva por diagnóstico y revisión.

Responses API usa salida estructurada y modelo fijado, con tres llamadas máximas por revisión, reservadas antes de cada solicitud y persistidas. Hechos deben copiar un claim y citar su referencia; propuestas y desconocidos requieren confirmación. Referencias inexistentes, cifras sin respaldo o secciones ausentes impiden publicar. Demo usa plantilla explícita y modo conectado no recurre silenciosamente a fixtures.

## API

| Método y ruta | Resultado |
|---|---|
| `POST /diagnostics` | `{profile,sourceMode?,fixtureId?}`; 202 e inicia lectura. |
| `PATCH /diagnostics/:id` | Corrige perfil y crea revisión; preserva reportes previos. |
| `GET /diagnostics/:id` | Progreso, vista gratuita y estados; no revela informe detallado. |
| `POST /diagnostics/:id/reports` | `{opportunityId}`; prepara, valida y congela una versión. |
| `GET /reports/:id` | 402 con cotización o paquete tras pago confirmado. |
| `GET /reports/:id?format=markdown` | Exporta la versión pagada sin nuevo cobro. |
| `GET /api/diagnostics` | Lista privada para retomar proyectos. |
| `POST /api/demo-pay/:id` | Sólo local-fixture, liquidación simulada por la misma máquina de pagos. |
| `GET /api/payments/:id` | Estado privado de operación; no desbloquea incertidumbre. |

Entrada JSON hasta 64 KiB, veinte revisiones/hora por sesión y ocho trabajos por proceso. Sesión HttpOnly y propiedad comprobada; peticiones de otros orígenes rechazadas. Servidor local: despliegue, abuso entre múltiples sesiones y gestión operativa deben resolverse antes de una beta pública.

## Informe y pago

Hash de entradas, evidencia y catálogo por revisión; versión lista inmutable. SQLite liga clave idempotente y autorización global a un solo informe. IA termina antes de firmar/liquidar. Descargas posteriores devuelven contenido y recibo sin otro cargo.

Estados: verifying → rejected antes de liquidar; verifying → settling → confirmed con acceso atómico; settling → uncertain ante respuesta dudosa. Al reiniciar, verificación interrumpida se rechaza y liquidación interrumpida queda incierta. Bloqueo conservador hasta conciliación externa; herramienta de conciliación todavía pendiente.

Wallet Standard desktop, firma v0 devnet, sin custodia. Red, USDC, receptor, importe y recurso validados. 0,01 USDC exclusivamente de prueba. **Compra real devnet pendiente por instrucción del usuario**; también falta validar generación con OpenAI real. Bundle y fixtures no sustituyen esas comprobaciones.

La copia editable vive en el navegador y puede exportarse Markdown/JSON; no cambia el paquete pagado ni envía postulaciones.
