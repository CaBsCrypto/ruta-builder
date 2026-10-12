# Entrevistas para elegir entre control de compras y reportes USDC

El objetivo es identificar un trabajo recurrente que alguien necesite resolver y comparar ambos candidatos antes de construir el producto completo. Empezar con cinco conversaciones por segmento, de 20 a 30 minutos. Pedir ejemplos recientes y observar el proceso actual antes de mostrar la propuesta. Esta guía prepara las conversaciones; la demanda permanece pendiente de validación.

## Equipos que usan agentes para comprar servicios

Seleccionar responsables de ingeniería u operaciones que ya tengan agentes consumiendo APIs o herramientas pagadas. Registrar por separado equipos con compras autónomas actuales y equipos que solo consideran incorporarlas.

1. En la última tarea de un agente que consumió un servicio pagado, ¿qué compró, cómo pagó y quién decidió el límite? Pedir un registro anonimizado o una demostración del flujo.
2. En los últimos 30 días, ¿cuántas tareas y compras realizaron, cuánto gastaron y qué parte pueden atribuir a un proyecto, agente y resultado? Distinguir cifras observadas de estimaciones.
3. Describe el último gasto inesperado, reintento duplicado o resultado comprado que no sirvió. ¿Cómo lo detectaron, qué hicieron y cuánto tiempo o dinero costó?
4. ¿Cómo controlan hoy proveedores permitidos, presupuesto y concurrencia? ¿Qué ocurre si el agente paga fuera de ese cliente o utiliza otra billetera? Identificar la parte del proceso que aceptarían centralizar.
5. Ante un prototipo que relacione compra, presupuesto y recibo, ¿qué tarea real probarían durante una semana, quién lo integraría y qué resultado justificaría seguir usándolo? Preguntar por el presupuesto y quién puede aprobarlo después de entender el problema.

Una prueba útil necesita una tarea real, un proveedor y un responsable. El prototipo limita las compras que pasan por nuestro cliente; otras rutas de pago requieren controles adicionales. No presentar los límites locales como una restricción universal sobre la billetera.

## Responsables de comunidades y microgrants

Seleccionar personas que preparen rendiciones de una tesorería USDC en Solana. Priorizar quienes entregaron un reporte durante los últimos 60 días y pueden mostrar un ejemplo anonimizado.

1. Muéstrame cómo preparaste la última rendición: ¿quién la solicitó, qué período cubría y qué herramientas usaste desde las transacciones hasta la entrega?
2. ¿Cuántas transferencias, billeteras y horas de trabajo tuvo ese reporte? ¿Con qué frecuencia debes repetirlo y quién revisa las cifras?
3. Describe la última diferencia entre tu reporte y las transacciones: duplicados, transferencias internas, datos ausentes o movimientos difíciles de etiquetar. ¿Cómo la resolviste y qué evidencia necesitó el revisor?
4. ¿Qué información falta en los exports o herramientas actuales para completar tu rendición? ¿Qué datos deben mantenerse privados y qué señales te permiten aceptar un reporte con cobertura incompleta?
5. Ante un reporte pagado por consulta, ¿qué lote real probarías, qué salida necesitas y con qué lo compararías? ¿Quién puede autorizar la prueba y qué precio o ahorro de tiempo justificaría repetirla?

El primer reporte cubre transferencias del mint configurado y un lote explícito. Verificar que ese alcance resuelva el trabajo del usuario antes de añadir swaps, múltiples monedas, balances contables o valoraciones. La IA puede explicar cifras que tienen evidencia; las etiquetas inciertas deben conservar su condición de propuesta.

## Registro de evidencia

| Campo | Qué registrar |
|---|---|
| Participante | Alias, segmento, rol y capacidad de decisión |
| Trabajo reciente | Fecha, frecuencia y pasos observados |
| Costo actual | Tiempo, herramientas y gasto; indicar si es observado o estimado |
| Evidencia | Archivo anonimizado, captura o enlace autorizado |
| Problema | Incidente concreto, impacto y alternativa actual |
| Compromiso | Tarea, datos, responsable y fecha de una prueba |
| Resultado esperado | Métrica para comparar con el proceso actual |
| Precio | Presupuesto real y autoridad para aprobarlo |
| Seguimiento | Próxima acción acordada y permiso para conservar los datos |

Conservar únicamente los datos que el participante autorice. No solicitar claves privadas, secretos de API ni información personal de beneficiarios. Una reacción positiva a la idea sirve como comentario; una tarea concreta, acceso a datos y una fecha de prueba aportan evidencia más fuerte de utilidad.

## Criterio para elegir

Evaluar después de las conversaciones y las pruebas técnicas. Dar prioridad al candidato con un trabajo recurrente documentado, una mejora medible frente a su alternativa y al menos dos participantes dispuestos a probarlo con datos o tareas reales. Este umbral guía la decisión; no equivale a demanda comercial confirmada.

Si ambos cumplen, comparar el costo por operación, el esfuerzo de integración y el tiempo para completar una demostración de x402. Si ninguno cumple, ajustar el usuario o el trabajo antes de invertir las siguientes semanas. Los resultados técnicos y sus límites se registran en [Validación técnica](validation.md).
