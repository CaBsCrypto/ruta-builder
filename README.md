# Ruta Builder · Solana primero

Acompañante para pasar de una idea a una postulación preparada: conocer el proyecto, revisar web y repositorio públicos, confirmar evidencias, elegir una oportunidad y editar un borrador. React/Vite + TypeScript, Express y SQLite. El MVP cubre Solana; otras redes pueden registrarse como interés con cobertura no disponible.

Repositorio: [CaBsCrypto/ruta-builder](https://github.com/CaBsCrypto/ruta-builder). Licencia [MIT](LICENSE). Builder: **cabs**, participante individual, con desarrollo asistido por IA.

## Demo pública para Encode

[Abrir Ruta Builder](https://ruta-builder-cabscryptocontacto-6028s-projects.vercel.app/) · acceso sin cuenta ni wallet. [CI](https://github.com/CaBsCrypto/ruta-builder/actions/workflows/ci.yml).

La demo publicada reproduce perfil → fuentes de ejemplo → requisitos → informe → borrador editable y exportación. Funciona íntegramente en el navegador: los datos quedan en localStorage, la IA es una plantilla y el desbloqueo es simulado. No lee URLs externas, no llama OpenAI, no solicita firmas y no liquida USDC. El catálogo es una reproducción de las fichas revisadas el 11 de octubre de 2026; no acredita que sigan disponibles ni elegibilidad actual.

El backend Express/SQLite completo se conserva en este repositorio y se reproduce con los comandos siguientes. La demo pública muestra el producto y sus límites; **no demuestra liquidación x402 en cadena**, que continúa pendiente por decisión del usuario. [Detalles y reproducción de la demo pública](docs/public-demo.md).

## Probar la aplicación

Requiere Node.js **22.20 o posterior** y npm. Desde este directorio:

```powershell
npm ci
npm run build
npm run coach:demo
```

Abrir **http://127.0.0.1:4311**. Elegir un ejemplo sintético, continuar a fuentes, analizar, confirmar el perfil, elegir una oportunidad, preparar el informe y pulsar **Pago simulado**. Los ejemplos no representan proyectos verificados. También admite una idea propia y fuentes públicas reales. En demo, IA y liquidación son simuladas: no firma wallets ni mueve tokens.

La cookie privada HttpOnly dura 30 días y su token se guarda como hash. SQLite en `.cache/coach-demo.sqlite` permite retomar proyectos y descargar una versión pagada sin otro cargo. Conservar cookie y base; detener el proceso con Ctrl+C. El servidor escucha en loopback: es una aplicación local, sin despliegue público.

```powershell
npm run typecheck
npm test
npm run research:check
npm run coach:smoke
```

Para editar UI, iniciar backend con `COACH_PUBLIC_ORIGIN=http://127.0.0.1:4310` y, en otra terminal, `npm run web:dev`. Vite dirige API al backend 4311. Las cotizaciones usan un origen configurado, nunca el encabezado Host.

## Modo conectado

Copiar `.env.example` a `.env`, completar `OPENAI_API_KEY` y `COACH_PAY_TO` con la dirección pública receptora de Solana devnet, y ejecutar `npm run coach:start`. Usa `.cache/coach-devnet.sqlite`. Wallet Standard desktop requiere devnet y firma local v0; el facilitador x402 liquida. No hay custodia ni signAndSendTransaction.

Responses API usa salida estructurada y `gpt-5.4-mini-2026-03-17`, con un máximo persistente de tres intentos por revisión. Sin clave funciona la vista gratuita; no prepara informes conectados. Una salida inválida no se reemplaza por una demo ni se cobra.

**La compra real en devnet permanece pendiente por decisión del usuario.** La firma y liquidación reales y las llamadas a OpenAI todavía no se verificaron en este producto. No ejecutar `devnet:purchase` para reproducir esta entrega. El precio **0,01 USDC** usa tokens de prueba y no define una tarifa comercial.

## Evidencia y pagos

- Lectura HTTPS con DNS fijado y bloqueo de destinos privados. Tres páginas del mismo sitio y 30 archivos GitHub fijados a commit; 256 KiB por respuesta, 3 MiB y 30 segundos. Excluye/redacta credenciales y nunca ejecuta el repositorio.
- Evidencias observadas y declaraciones conservan fecha y referencias. Un SDK, README o import no acredita integración ejecutada, usuarios ni gasto. Cobertura parcial y omisiones son visibles.
- El catálogo distingue grants, premios, aceleradoras y créditos. Excluye fichas cerradas, pausadas, vencidas o de más de 14 días; revalidar manualmente `research/coach-catalog.json`. El organizador confirma admisión y elegibilidad.
- El informe se prepara y valida antes de liquidar, queda ligado a entradas/evidencias/catálogo y permanece inmutable. La vista gratuita no revela el contenido detallado.
- Un pago incierto bloquea otra autorización incluso tras reiniciar. La conciliación aún requiere revisión externa; no hay botón de desbloqueo ni reenvío automático.
- El borrador editable se guarda en el navegador y se exporta como copia del builder, sin modificar el informe pagado ni enviarse a programas.

## Documentos y segunda etapa

- [Contrato del MVP y API](docs/mvp.md)
- [Cuatro semanas para Encode](docs/encode-plan.md)
- [Validación de esta implementación](docs/coach-validation.md)
- [Investigación original](docs/research.md)
- [Catálogo Solana](research/coach-catalog.json)
- [Especificación conservada de rendiciones](docs/microgrant-renditions.md)

Los prototipos A (`src/buyer`, `src/payments`) y B (`src/reports`) se conservan. `npm run coach:smoke` prueba el informe nuevo con el comprador A, duplicados y descarga posterior; sólo usa fixtures. `npm run demo` reproduce la comparación anterior. Cuando exista una comunidad financiadora, B servirá para rendiciones USDC; ese fondo aún no forma parte del producto.

Declarar todo el código existente al **11 de octubre de 2026** como trabajo previo para Encode. La investigación no equivale a inscripción ni entrega realizadas.

La etiqueta [`encode-prehackathon-2026-10-11`](https://github.com/CaBsCrypto/ruta-builder/tree/encode-prehackathon-2026-10-11) conserva la base publicada antes de la ventana del hackathon. Validación: **113 pruebas**, TypeScript, ambos builds y smoke test; recorrido público hasta edición, descarga y recuperación del borrador en el mismo navegador.
