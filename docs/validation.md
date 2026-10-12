# Comparación técnica de los dos candidatos

Los prototipos permiten comparar ambos flujos con pruebas reproducibles. **44 pruebas locales pasan**: doce de presupuesto, doce de HTTP x402 y veinte de reportes. La demo reconstruye un lote conocido y completa compras simuladas. La comprobación de lectura confirma Solana devnet, USDC y soporte del facilitador. **La compra real queda pendiente por decisión del usuario**, tras comprobar que las wallets descartables carecen de USDC y de sus cuentas de tokens.

Ejecuciones del 11 de octubre de 2026. El resultado técnico no confirma demanda ni disposición a pagar. Tras comparar ambos candidatos, el usuario eligió **B: rendiciones de microgrants USDC**. Su [MVP](mvp.md) y [plan para Encode](encode-plan.md) reutilizan esta base; [la guía de entrevistas](interview-guide.md) define qué evidencia comercial recoger.

## A. Control de compras

El [cliente de presupuesto](../src/buyer/index.ts) reserva importes antes de esperar la respuesta del proveedor. El [adaptador x402](../src/payments/client.ts) comprueba red, mint, destinatario, recurso e importe de la cotización antes de autorizar. El SDK oficial de x402 construye y codifica el intercambio V2; las pruebas locales sustituyen la firma y liquidación de Solana por fixtures identificados explícitamente.

| Prueba ejecutada | Resultado |
|---|---|
| Compra mayor que el presupuesto | Rechazada antes de llamar al adaptador de pago. |
| Cien compras concurrentes de diez unidades, presupuesto cien | Diez admitidas y noventa rechazadas; gasto total cien. |
| Reintento mientras la compra está en curso y después | Misma promesa y recibo; una llamada de liquidación. |
| Misma clave para otra solicitud | Conflicto; no compra nueva. |
| Veinte solicitudes HTTP concurrentes y replay con otra clave | Una liquidación simulada para la misma transacción autorizada. |
| Red, mint, proveedor, destinatario, recurso o pertenencia incorrectos | Rechazo por política. |
| Cotización con importe o fee payer alterado | Rechazo antes de firma o verificación, según el caso. |
| Respuesta perdida después de autorizar o liquidar | Estado incierto; presupuesto retenido y sin nueva autorización automática. |
| Resultado del servicio fallido después de un pago confirmado | El gasto permanece contabilizado. |
| Reporte imposible de generar o serializar | Fallo antes de liquidar; no cargo. |

La [demo](../src/cli/demo.ts) usa un presupuesto de 20.000 unidades mínimas y consultas de 10.000: primera compra y reintento comparten recibo; de dos compras nuevas concurrentes, una se admite y la otra excede el presupuesto. Termina con dos liquidaciones **simuladas**, cuatro solicitudes HTTP y cero transacciones blockchain. [Resultado local](../output/comparison.json)

Las reservas y cachés son locales a un proceso. Los límites cubren las compras realizadas por este cliente; no restringen universalmente una wallet. El adaptador interpreta el indicador `rejectedBeforeSettlement` de nuestro servidor permitido: ese indicador requiere confianza en la integración y no constituye una prueba independiente para cualquier proveedor externo. La persistencia, recuperación y conciliación tras reinicios siguen siendo trabajo de MVP.

## B. Reportes USDC

El [reconciliador](../src/reports/reconcile.ts) trabaja con un lote explícito de firmas y respuestas RPC. Conserva el mint, propietarios, unidades mínimas, firma y ruta de instrucción; valida programa SPL Token, transferencias internas/CPI y diferencias de balance. Una transacción ausente o un layout no soportado queda como excepción que afecta la cobertura.

El lote de referencia tiene cincuenta firmas **sintéticas**: trece entradas, trece salidas, doce transferencias internas y doce operaciones sólo de SOL. Produce treinta y ocho transferencias relevantes con estos totales esperados:

| Magnitud | Unidades mínimas | USDC sintético |
|---|---:|---:|
| Entradas | 325.000.000 | 325,000000 |
| Salidas | 338.000.000 | 338,000000 |
| Internas | 300.000.000 | 300,000000 |
| Neto | −13.000.000 | −13,000000 |

También pasan casos de duplicados idénticos y contradictorios, transacciones fallidas, mint ajeno, firma discordante, propietarios o datos ausentes, instrucciones no soportadas, decimales incorrectos, cantidades mayores que `Number.MAX_SAFE_INTEGER`, diferencias de balance y escapes de CSV. Un alias `spl-token` con ID de programa desconocido o contradictorio no puede contarse como transferencia válida. [Pruebas](../tests/reports.test.ts)

[JSON con fuente y evidencia](../output/report-synthetic.json) y [CSV de transferencias](../output/report-synthetic.csv) están disponibles en esta carpeta. La cobertura completa significa que se resolvió **el lote solicitado**; no acredita el historial completo de una tesorería, una auditoría ni finalización en la cadena. El resumen de la demo es una plantilla determinista con evidencias y no ejecuta un LLM.

El [CLI de RPC](../src/cli/report-rpc.ts) admite hasta cincuenta firmas conocidas en devnet. Comprueba el genesis antes de leer, conserva RPC cruda y declara errores. Usa `confirmed`, no `finalized`.

Una prueba adicional de lectura a las 06:49 UTC consultó tres transacciones públicas del mint y reconcilió una transferencia real observada de 1.000 unidades mínimas, equivalente a 0,001 USDC de devnet. Su salida y cambio de balance coinciden en −1.000 unidades; el lote de una firma quedó completo. La fuente RPC original se conserva en [devnet-sample.json](../output/devnet-sample.json). Esta comprobación verifica el parser con datos reales, sin una verdad de referencia independiente ni cobertura histórica; no corresponde a una compra realizada por nosotros. Consumió cinco lecturas y no envió transacciones.

## Qué se verificó en devnet

La ejecución `devnet:check` del 11 de octubre a las 06:37 UTC confirmó el genesis completo de devnet, el mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` con seis decimales y soporte `exact` V2 de devnet en el facilitador oficial. Consumió tres lecturas RPC; no autorizó ni liquidó pagos. [Evidencia](../output/devnet-check.json)

La ejecución `devnet:purchase` a las 06:47 UTC hizo cuatro lecturas y salió como `blocked-funding`: ambos saldos USDC son cero y ninguna ATA existe. No firmó ni envió una transacción. [Evidencia de la precondición](../output/devnet-purchase.json)

Las direcciones públicas descartables para retomar la prueba son:

- Comprador: `3MfFmtEB7vtWZv9HsKvheBAnskSBBbrTyS9jx9GQhXMy`
- Vendedor: `8C6A4DD6WsmyJdN4kx67iZtBY5MFA7b6BB4htLJhd9CU`

Las semillas se guardan en `.cache/`, excluida de Git; no se usaron claves del usuario. [Circle Faucet](https://faucet.circle.com/) ofrece USDC de Solana Devnet mediante un formulario con reCAPTCHA. El usuario pidió dejar esta compra pendiente. No se ha inscrito el proyecto ni contactado a terceros.

El [comando de compra](../src/cli/devnet-purchase.ts) está preparado para una consulta de 0,01 USDC de prueba. Si se retoma, debe confirmar el pago mediante una lectura independiente de su firma y reconciliar una entrada exacta entre las wallets. Conserva un marcador antes de autorizar; ante un intento confirmado o incierto, impide comprar otra vez al reiniciar y conserva la evidencia previa. La guardia se comprobó sin red para éxito previo, incertidumbre y archivo inválido. Esto reduce reejecuciones de la prueba; no sustituye la persistencia transaccional necesaria en un producto.

## Costos, utilidad y dificultad

| Aspecto | A. Comprador | B. Reportes |
|---|---|---|
| Flujo ya demostrado | Presupuesto → compra → resultado/recibo, con fallos y concurrencia. | Lote conocido → transferencias y excepciones → JSON/CSV; cobro HTTP simulado. |
| Operaciones observadas | Dos solicitudes al recurso por compra nueva; verificación y liquidación en el facilitador. Los reintentos deduplicados no repiten una compra. | Conciliación local sin RPC en el fixture; el CLI real requiere una lectura del genesis más una por firma única. |
| Trabajo difícil del MVP | Persistir reservas; recuperar resultados inciertos; atribuir gasto a tareas y agentes. | Obtener un lote suficiente; conservar cobertura; etiquetas y formato que ahorren trabajo al responsable. |
| Uso de IA pendiente | Una tarea real que el agente complete bajo presupuesto y una explicación de excepciones. | Resumen y etiquetas propuestos a partir de evidencias, con aceptación humana cuando corresponda. |
| Utilidad que falta probar | Frecuencia de compras y mejora frente al control actual del equipo. | Tiempo ahorrado y disposición a pagar frente a un export o herramienta contable. |
| Encaje inicial | Desafío x402 de Encode. | Desafío x402; Consumer App por confirmar según el producto y reglas. |

Para cincuenta firmas únicas, B requiere al menos cincuenta y una lecturas en este CLI, además del cobro. A incorpora el costo del servicio comprado. Ambos agregan RPC del SDK, facilitador, cómputo, almacenamiento y eventualmente tokens de IA; la telemetría del adaptador de lectura no cuenta llamadas internas del SDK ni del facilitador. El costo comercial por operación permanece pendiente. El [informe](research.md) enlaza las condiciones oficiales de los proveedores y las alternativas existentes.

En una ejecución local, procesar el fixture tomó aproximadamente 4,6 ms y la primera compra HTTP simulada 77 ms. Son observaciones de una ejecución en esta máquina, sin distribución estadística ni liquidación remota; no sirven como promesa de latencia o costo de producción. No se consumió un modelo de IA ni se contrataron servicios.

## Reproducir y continuar con B

Los comandos y dependencias están en el [README](../README.md). `npm test`, `npm run demo` y `npm run research:check` permiten reproducir la comparación. El último validador comprueba ocho tracks, treinta y siete side tracks, siete programas, unicidad, fuentes HTTPS y conversiones de cierre a Santiago; no vuelve a consultar sus condiciones online. [Resultado del inventario](../output/research-check.json)

La elección de B establece una dirección de desarrollo, no una validación de demanda. El nuevo plan propone dos entrevistas iniciales y hasta dos pilotos por confirmar para medir tiempo, correcciones y utilidad frente al CSV actual. La cobertura de datos y la integración real de pago siguen siendo dependencias: **la compra devnet continúa pendiente**. Los resultados anteriores no cambian con esta decisión.
