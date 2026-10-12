# Plan de cuatro semanas para presentar B en Encode

El proyecto elegido es **B: una rendición de USDC para comunidades y microgrants**, construida en Solana y TypeScript. El responsable carga presupuesto y transferencias, revisa diferencias y obtiene evidencia con un resumen verificable. El contrato se define en [mvp.md](mvp.md). A se conserva como demo interna del cliente de compras para probar el cobro.

El calendario usa **America/Santiago**. Encode comienza el 12 de octubre, fija checkpoints el 18 de octubre y el 1 de noviembre, y cierra la inscripción el 1 de noviembre. La entrega oficial del 8 de noviembre a las 23:59 UTC−12 equivale al **9 de noviembre de 2026 a las 08:59 en Santiago**. Nuestra meta interna es entregar el **8 de noviembre a las 18:00 en Santiago**, con margen para revisar el paquete. Esta meta es nuestra, no del organizador. [Calendario oficial de Encode](https://www.encodeclub.com/programmes/solana-hackathon-2026)

## Punto de partida y alcance

El 11 de octubre pasan **44 pruebas locales**: veinte del reconciliador B y veinticuatro de presupuesto/HTTP x402. Ya existen extracción de un lote conocido, evidencia JSON/CSV, cotización y controles del SDK x402, y fixtures de firma, verificación y liquidación. Estos resultados se documentan en [validation.md](validation.md); no certifican una compra pagada en cadena ni demanda comercial.

Declararemos este código como **preexistente al hackathon** y separaremos sus cambios de los realizados entre el 12 de octubre y el 8 de noviembre, ventana que Encode evalúa. El repositorio incluirá una referencia del estado inicial y un registro de avances. [Reglas de participación de Encode](https://www.encodeclub.com/programmes/solana-hackathon-2026)

El MVP trabaja con una tesorería, USDC de devnet y hasta cincuenta firmas conocidas por lote. Conserva la cobertura explícita; los datos ausentes y las coincidencias ambiguas requieren revisión. El presupuesto y propósito de cada desembolso los aporta el usuario. La IA explica cifras y excepciones ya calculadas, sin asignar pagos ni inferir propósitos; cualquier categoría basada en el texto del usuario requiere revisión. Mainnet, auditoría contable, programas Rust propios, múltiples organizaciones y suscripciones de producción quedan fuera de este alcance.

Durante el desarrollo, Codex implementará y verificará el código y preparará documentación y guion. El usuario definirá ejemplos y lenguaje de rendición, coordinará participantes y realizará inscripción y entrega. Cada semana revisaremos su entregable antes de ampliar el alcance.

## Semana 1 · 12–18 de octubre

**Resultado revisable:** una rendición local reproducible con presupuesto importado y pagos asociados a evidencia.

- Implementar el CSV previsto del MVP: `payout_id,grant_id,recipient_owner,expected_usdc,label`, con validación e importes enteros.
- Asociar pagos mediante reglas explícitas; distinguir coincidencia, diferencia de importe, pago sin referencia y desembolso sin pago. Las ambigüedades permanecen visibles.
- Añadir un fixture de rendición con resultados esperados y casos que puedan cambiar una decisión del responsable; reutilizar el parser existente.
- Preparar dos entrevistas sobre una rendición reciente y su alternativa actual. El usuario coordina las conversaciones; registrar ejemplos, frecuencia y tiempo empleado sin atribuir interés comercial a una respuesta favorable.
- Preparar el checkpoint del **18 de octubre** con demo local, alcance y declaración del código previo.

**Criterio de avance:** cada cifra y asociación tiene una evidencia o una explicación de ausencia; el fixture permite revisar las excepciones. Si las entrevistas aún no ocurren, registrar la demanda como pendiente.

## Semana 2 · 19–25 de octubre

**Resultado revisable:** flujo de interfaz completo, desde la carga hasta la exportación.

- Crear pantallas para importar presupuesto, seleccionar lote devnet, revisar asociaciones y aceptar etiquetas.
- Mostrar previsto frente a observado, excepciones, firma y ruta de instrucción; ofrecer JSON/CSV junto al resumen legible.
- Medir el tiempo de completar la misma tarea con el CSV actual y con la interfaz; registrar errores y pasos manuales.
- Preparar y coordinar, mediante el usuario, hasta dos pilotos de experiencia de uso. Sus participantes y fechas siguen por confirmar. Usar fixtures o lotes devnet autorizados: la comparación con un proceso real no implica consultar silenciosamente wallets mainnet ni auditar su tesorería.

**Criterio de avance:** una persona puede explicar las diferencias y exportar sus evidencias. La mejora frente al CSV se informa con observaciones reales; si todavía no hay participantes, permanece como hipótesis.

## Semana 3 · 26 de octubre–1 de noviembre

**Resultado revisable:** reporte parametrizado, recuperación tras reinicio y resumen respaldado por evidencia.

- Parametrizar el cobro x402 por reporte, con configuración validada de red, mint, destinatario, importe y recurso. Reutilizar el adaptador y los fixtures actuales.
- Persistir en SQLite la solicitud, su identidad, estado de cobro, recibo y reporte; comprobar reinicios, reintentos y estados inciertos sin repetir una liquidación automáticamente.
- Incorporar el resumen de IA con referencias a cifras y excepciones; validar sus evidencias y conservar la plantilla determinista cuando falle. Las categorías sugeridas requieren aceptación del usuario.
- Medir llamadas RPC, uso del modelo, almacenamiento, tiempo de procesamiento y fallos. Registrar por separado costes observados y tarifas pendientes.
- Preparar el checkpoint intermedio y completar manualmente la inscripción antes del **1 de noviembre**, según el proceso del organizador. [Encode](https://www.encodeclub.com/programmes/solana-hackathon-2026)

**Criterio de avance:** la recuperación y el resumen funcionan con el lote de referencia. **La compra real en devnet sigue pendiente por decisión del usuario**; esta semana no programa su ejecución ni presupone que se retome.

## Semana 4 · 2–8 de noviembre

**Resultado revisable:** paquete de entrega reproducible y demo que distingue hechos de pendientes.

- Corregir los fallos encontrados, revisar entradas malformadas, cobertura, exportaciones y recuperación; ejecutar las pruebas pertinentes.
- Completar README, instrucciones de demo, arquitectura, integración Solana, costes medidos, límites y registro de desarrollo durante Encode.
- Grabar el video de **2–4 minutos**: problema, carga, revisión de diferencias, evidencia, resumen y estado del cobro. Preparar repositorio y demo funcional conforme a los entregables publicados. [Requisitos de entrega](https://www.encodeclub.com/programmes/solana-hackathon-2026)
- Revisar el paquete y realizar la entrega manual para nuestra meta del **8 de noviembre a las 18:00 Santiago**.

**Criterio de preparación:** un tercero reproduce la rendición y comprende la cobertura. Publicar tiempo observado frente al CSV, asociaciones pendientes, errores detectados, coste por reporte y calidad del resumen, indicando muestra y componentes sin medir.

La liquidación x402 en cadena y su lectura independiente siguen siendo una dependencia pendiente mientras el usuario difiera la compra real. El scaffold y las liquidaciones locales simuladas se presentan como tales. Esta condición limita la evidencia disponible para el desafío x402; el paquete no afirmará una integración de pago validada en cadena.
