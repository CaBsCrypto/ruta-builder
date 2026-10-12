# MVP: rendiciones de microgrants USDC

Decisión del 11 de octubre de 2026: construir **B para Encode**, reutilizando los prototipos TypeScript. El usuario inicial es el responsable de una comunidad que debe explicar qué desembolsos de microgrants estaban previstos, cuáles aparecen en un lote de transferencias y qué diferencias requieren revisión. El resultado es una rendición descargable con evidencia y cobertura explícita. La demanda y el precio comercial siguen pendientes de validar.

Este documento define trabajo por construir; los resultados ya ejecutados están en [validation.md](validation.md). El calendario y criterios semanales están en [encode-plan.md](encode-plan.md).

## Alcance y recorrido

Una tesorería, un operador, Solana **devnet**, el mint USDC de seis decimales configurado en [config.ts](../src/shared/config.ts), hasta 50 desembolsos previstos y 50 firmas únicas por lote. La aplicación prepara una rendición; no distribuye los grants ni necesita las claves de la tesorería. El cliente que compra el reporte usa una wallet distinta.

1. Importar el CSV de desembolsos previstos e indicar tesorería y firmas conocidas.
2. Leer las transacciones, conservar las respuestas RPC y mostrar cobertura y excepciones.
3. Proponer asociaciones, revisar ambigüedades y confirmar las asignaciones.
4. Mostrar previsto, observado y diferencia; congelar una versión de la rendición.
5. Obtener el paquete final mediante el endpoint x402: vista legible, resumen y exportaciones JSON/CSV.

La interfaz tendrá tres pasos: **cargar**, **revisar**, **obtener rendición**. La primera versión es local o una demo privada para un operador. Una demo pública usa exclusivamente fixtures; los archivos de los participantes no se publican. La inscripción, contactos y entrega a Encode son acciones futuras del usuario, no realizadas por este plan.

## Entradas

CSV UTF-8 con estas columnas, una fila por desembolso:

```csv
payout_id,grant_id,recipient_owner,expected_usdc,label
```

| Campo | Regla |
|---|---|
| `payout_id` | Identificador único del desembolso; un grant puede tener varios hitos. |
| `grant_id` | Referencia del microgrant aportada por el responsable. |
| `recipient_owner` | Dirección pública del propietario destinatario, no su cuenta de tokens. |
| `expected_usdc` | Texto positivo con punto decimal y hasta seis decimales; convertir a unidades enteras, sin `Number` para importes. |
| `label` | Propósito declarado por el responsable; no prueba on-chain. |

Validar identificadores, direcciones, encabezados, duplicados e importes antes de consultar RPC. Las firmas se deduplican y deben ser válidas. El responsable declara cómo seleccionó el lote. Un nombre de período es metadato: no acredita que incluimos todas sus transacciones. Mostrar `confirmed`, fecha de consulta, slot y `blockTime` cuando estén disponibles; un dato temporal ausente permanece visible.

## Asociaciones y diferencias

Reutilizar [reconcileTransfers](../src/reports/reconcile.ts). Cada transferencia conserva **firma + ruta de instrucción**; una firma puede contener varios pagos. Crear una capa de desembolsos y asignaciones sobre su salida, sin reemplazar el parser ni usar sus etiquetas por firma como identidad del pago.

- Proponer únicamente salidas de USDC desde la tesorería al propietario previsto, con transacción y balance conciliados sin excepciones que invaliden esa evidencia. Los movimientos internos no cuentan como desembolsos.
- Cada transferencia completa se asigna a un solo `payout_id`; varias transferencias pueden cubrir un desembolso. No dividir una transferencia entre grants en esta versión.
- Si varias filas tienen el mismo destinatario, pedir selección humana. No resolver por orden, parecido de importes, signer, etiquetas ni IA.
- Confirmar las propuestas antes de congelar el reporte; admitir confirmación conjunta de las inequívocas. Guardar quién confirmó y sus cambios. No ocultar transferencias sin asociación.

Mostrar por desembolso `esperado`, `observado asignado` y `diferencia = observado − esperado`, en unidades enteras y formato USDC.

| Resultado | Significado dentro del lote |
|---|---|
| `no_observado` | No hay pagos asignados; no prueba que el grant esté impago. |
| `parcial` | Importe asignado positivo, menor al previsto. |
| `coincide` | Importe asignado igual al previsto. |
| `exceso` | Importe asignado mayor al previsto. |
| `ambiguo` | Hay una asociación pendiente de resolver; mostrar además el importe confirmado. |

La cobertura tiene un estado independiente: `lote_verificado` o `datos_incompletos`, con sus razones. Una coincidencia de importe puede convivir con datos incompletos en otras transacciones. El primero significa que el parser resolvió el lote solicitado según sus comprobaciones; no certifica historia completa, finalidad del gasto, autenticidad independiente del RPC ni una auditoría.

## Paquete de rendición

La vista legible y el JSON incluyen desembolsos, asignaciones confirmadas, totales, diferencias, transferencias sin asociación, cobertura y excepciones. Cada cifra observada enlaza su firma y ruta de instrucción. Conservar RPC cruda, red, mint, commitment, momento de lectura y versión del reconciliador.

Exportar `rendicion.json`, `desembolsos.csv`, `transferencias.csv` y `excepciones.csv`. Mantener los escapes de fórmulas y precisión del export existente. Un CSV aislado no comunica toda la cobertura: el paquete siempre incluye JSON. Las etiquetas y confirmaciones humanas quedan identificadas como tales.

La IA redacta un resumen de cifras, diferencias y excepciones ya calculadas. Debe citar los identificadores de evidencia; no calcula importes ni asigna pagos o propósitos. Una categoría sugerida sólo puede partir del texto aportado por el usuario y requiere aceptación. Si el modelo falla o introduce una afirmación sin respaldo, usar el resumen determinista existente. La IA no bloquea la rendición ni altera sus totales.

## Cobro, persistencia y reutilización

El producto cobra por el **paquete final de una rendición**, no por cada descarga o paso de revisión. El precio actual de 0,01 USDC es exclusivamente de prueba; no constituye una decisión comercial. La compra real en devnet **sigue pendiente por decisión del usuario** y no se ejecuta ni se programa al definir este MVP.

| Base reutilizable | Trabajo nuevo |
|---|---|
| Reconciliador, RPC de lectura y export de transferencias. | CSV previsto, asociaciones, estados de desembolsos y export de rendición. |
| Servidor Express y SDK x402 V2; hoy sirven un recurso fijo. | Recurso inmutable por rendición, ligado a entrada, versión y términos de cobro. |
| Cliente A con política, presupuesto e idempotencia. | Usarlo como cliente interno de demo; sin pantalla de control de agentes. |
| 44 pruebas locales, fixtures y muestra RPC devnet. | Casos del flujo microgrants, reinicios, evidencia del resumen y medición de utilidad. |

Mantener TypeScript/Express y una interfaz pequeña en TypeScript. SQLite guarda borradores, confirmaciones, versiones congeladas y operaciones de pago. Al congelar, generar un hash canónico de entradas, evidencia observada, asignaciones y versión. Cambiar una entrada o etiqueta genera otra versión; nunca cambiar el contenido bajo un recurso ya cotizado.

Contrato previsto: `POST /reports` guarda la rendición revisada y devuelve su ID; `GET /reports/:id` solicita el pago y entrega el paquete preparado. La cotización queda ligada a ese ID/hash, red, mint, precio y destinatario. Preparar y validar las exportaciones antes de liquidar. Los reintentos y las descargas posteriores reutilizan el recibo confirmado y el mismo paquete; no ocasionan otro cargo.

Persistir la operación antes de llamar al facilitador, con unicidad de clave idempotente y hash de autorización. Una clave asociada a otro recurso o payload produce conflicto. Un reinicio durante `settling` deja el pago `uncertain`: conservar la evidencia y bloquear otra autorización hasta conciliar. No renovar automáticamente firma o blockhash. Un recibo perdido requiere recuperación de la operación, no una compra nueva.

## Criterios de aceptación

| Caso | Resultado requerido |
|---|---|
| Esperado 250; pagos de 100 y 150 al mismo destinatario. | Tras confirmar, `coincide`, con las dos evidencias y diferencia cero. |
| Dos grants con un destinatario común. | Propuesta ambigua; revisión humana, sin asociación automática por importe. |
| Un pago de 300 frente a dos grants. | No se divide ni cubre ambos automáticamente. |
| Firma repetida o varios pagos en una firma. | No duplica importes; distingue rutas de instrucción. |
| Fallo, propietario ausente o balance discordante. | No se presenta como pago verificado; excepción y cobertura incompleta. |
| Reabrir borrador o descargar reporte comprado. | Conserva asignaciones y versión; no vuelve a cobrar. |
| Caída durante liquidación simulada. | Recupera estado incierto y bloquea una nueva autorización. |
| Resumen con cifra o explicación sin evidencia. | Rechaza esa salida y entrega el resumen determinista. |

La demo debe completar carga → revisión → rendición → cobro HTTP simulado → exportación reproducible. La liquidación real y su lectura independiente siguen siendo un criterio pendiente de la integración x402; una fixture no satisface esa evidencia en cadena.

## Prioridades y medición

**P0:** importación y validación, asociaciones revisables, cobertura, paquete reproducible, interfaz, recursos inmutables y pagos persistentes. **P1:** resumen IA, mejoras de dos pilotos por confirmar y pulido del video. Si la IA o los participantes no están disponibles, conservar el flujo determinista y declarar los pendientes.

Medir tiempo para preparar la misma rendición con el CSV actual y con el MVP; correcciones humanas, ambigüedades, errores y utilidad de las evidencias. Los pilotos del MVP usan fixtures o devnet. La demanda requiere conversaciones sobre tareas reales; comparar su proceso no habilita consultas mainnet automáticamente.

Registrar llamadas RPC, tokens del modelo, almacenamiento y latencia. Separar coste observado, tarifas aún desconocidas del facilitador/SDK y costes fijos. No extrapolar los milisegundos locales a producción ni asumir que los servicios siguen siendo gratuitos.

Fuera del MVP: mainnet, búsqueda exhaustiva de historial, múltiples monedas/tesorerías/organizaciones, contabilidad fiscal, identidades inferidas, pagos de grants, programa Rust propio y suscripciones. El objetivo para Encode es **Best Use of x402 on Solana**; evaluar Consumer App sólo si el organizador confirma el encaje. Calendario y requisitos: [Encode](https://www.encodeclub.com/programmes/solana-hackathon-2026).
