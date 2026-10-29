# Cobros Belo desde Gmail

Integración opcional: Google Apps Script lee los correos de Belo cada cinco minutos y envía avisos firmados a BOOSTIFY. No pide credenciales de Belo, no manda correos ni cambia etiquetas, mensajes o estados de Gmail. Google ejecuta los horarios con posibles demoras y cuotas: no es tiempo real ni una conciliación bancaria.

## Alcance confirmado

Solo pesos argentinos y solo correos recibidos desde la activación. El titular confirmó que todos los depósitos de esta cuenta corresponden a BOOSTIFY. Se admite el remitente exacto `transaction@belo.app`, DMARC aprobado por Gmail, asunto `Aviso de operación - DD/MM/YYYY H:mm:ss` o `HH:mm:ss`, texto `Depósito exitoso` y frase `Tu cuenta de belo recibió un depósito de $…`. El símbolo `$` se interpreta como ARS por configuración expresa de esta cuenta; el correo de ejemplo no incluye código ISO. Se rechazan otras monedas explícitas. Se admite texto plano y HTML convertido a texto sin ejecutar su contenido. Si cambia la plantilla, se manda a revisión; no se adivina el importe. Los retiros no se registran como gastos.

Cada cobro crea un ingreso en Otros con fecha/hora argentina del asunto, persistida en UTC. No se guarda el cuerpo del correo ni información del remitente de la transferencia. Se requiere el Message-ID y el identificador Gmail. El idempotency key es el SHA-256 del Message-ID; dos cobros del mismo importe siguen siendo operaciones distintas. Los avisos repetidos no sobrescriben importes ni ediciones. El comprobante de importación persiste incluso al eliminar un movimiento, evitando que reaparezca al sincronizar. Esta garantía aplica al mismo aviso: si Belo emite un aviso nuevo con otro Message-ID para la misma operación, hace falta conciliación con un identificador bancario que no figura en el ejemplo disponible.

## Preparación en BOOSTIFY y Vercel

1. Actualizar main en Codespaces y ejecutar `npm ci`.
2. Aplicar `npm run db:migrate` a la conexión **directa** de Neon, inyectada de forma segura, como en la instalación inicial. La migración añade `BeloImport` y su relación; no borra ni modifica movimientos existentes.
3. En Vercel, conservar las cuatro variables existentes y agregar **solo a Production**:
   - `BELO_IMPORT_ENABLED=true`
   - `BELO_IMPORT_CURRENCY=ARS`
   - `BELO_IMPORT_START_AT`: instante actual de activación en formato ISO UTC. Generar con `node -p 'new Date().toISOString()'`.
   - `BELO_WEBHOOK_SECRET`: secreto independiente generado con `openssl rand -base64 48`. No reutilizar SESSION_SECRET ni publicar el valor en GitHub o chat.
4. Aplicar esas variables mediante un nuevo despliegue. Hasta que estén completas, el receptor devuelve 503 y no procesa correos. La web manual sigue funcionando sin estas variables.

## Google Apps Script

1. En la cuenta Gmail que recibe los cobros, abrir https://script.google.com y crear un proyecto independiente `BOOSTIFY Belo`.
2. Copiar el contenido de `Code.gs` a su archivo de código.
3. En Configuración del proyecto, habilitar mostrar el manifiesto `appsscript.json` en el editor; reemplazarlo con el manifiesto de esta carpeta. Incluye el servicio avanzado Gmail v1 y los permisos de lectura, peticiones externas y disparadores. Si Google pide habilitar Gmail API en el proyecto Cloud asociado, hacerlo antes de ejecutar.
4. En **Propiedades de secuencia de comandos**, cargar:
   - `BOOSTIFY_URL=https://boostify-finanzas.vercel.app` (sin barra final).
   - `BELO_WEBHOOK_SECRET`: exactamente el mismo valor que en Vercel.
   - `BELO_IMPORT_START_AT`: exactamente la misma fecha ISO que en Vercel.
   - `BELO_IMPORT_CURRENCY=ARS`.
5. Guardar y ejecutar `setupBelo`. Autorizar el acceso de lectura a Gmail, las solicitudes HTTPS y la creación del disparador. El script es privado del dueño; no desplegarlo como aplicación web ni compartir el proyecto con terceros.
6. Ejecutar `syncBelo` una vez y revisar su registro. Después se ejecuta aproximadamente cada cinco minutos.

## Verificación y fallos

Esperar un depósito real posterior a la activación y comprobar importe/fecha en Belo, correo y panel. Ejecutar `syncBelo` de nuevo: el total debe permanecer igual. No hacer depósitos ficticios ni importar correos históricos para demostrar una prueba exitosa. Si un depósito ya se cargó manualmente después de activar, revisar antes de habilitar el script para evitar contar la misma venta por dos vías.

`showBeloReview` lista hasta 50 IDs Gmail y motivos de rechazo, sin cuerpos de correo. Para localizar un ID, abrir `https://mail.google.com/mail/u/0/#all/ID` con la cuenta correspondiente o buscar el aviso por fecha en Gmail. Revisar también Ejecuciones y los avisos de fallos de disparadores de Apps Script. Una respuesta 401 indica secreto/firma o reloj; 503 puede indicar integración desactivada, variables o migración pendiente, o indisponibilidad de base. Esos fallos no avanzan la página y se reintentan. Los rechazos 422 y mensajes no autenticados se conservan para revisión manual sin bloquear otros cobros.

Los recorridos usan páginas de 25 mensajes, hasta cuatro páginas por ejecución con presupuesto de tres minutos, y un cursor de recepción con solapamiento de 24 horas, limitado por el inicio configurado. Los reintentos son seguros mediante unicidad en PostgreSQL, incluso en solicitudes simultáneas. Si Google invalida un token de página se reinicia el recorrido desde el último cursor completo. Retrasos de correo superiores al solapamiento o cambios en `internalDate` pueden requerir un recorrido manual; no se promete que un buzón sustituya el extracto bancario.

Para pausar, ejecutar `stopBelo` o poner `BELO_IMPORT_ENABLED=false` en Vercel y redesplegar. No borrar las filas de BeloImport ni mover la fecha de inicio hacia el pasado: eso afecta la protección contra reimportación y el alcance acordado.

## Pruebas de desarrollo

`npm test` cubre parser, firmas HMAC, origen DMARC, reintentos y avisos ambiguos. `npm run test:belo-integration` requiere un build previo y `TEST_DATABASE_URL` con una base exclusiva de pruebas migrada. Arranca el build en 127.0.0.1:3102 y verifica solicitudes firmadas contra PostgreSQL, carreras sin duplicados, edición preservada y borrado sin reimportar. Limpia únicamente los registros creados por esa ejecución. Nunca toma DATABASE_URL como fallback ni configura Gmail o producción.

## Hora de última revisión

El agente reporta cada página revisada mediante el mismo endpoint HMAC, incluso si Gmail devuelve cero correos. PostgreSQL guarda la hora de recepción del reporte en UTC; el panel la muestra con segundos, formato 24 horas y zona America/Argentina/Cordoba. Distingue recorrido completo, páginas pendientes y avisos para revisión; si pasan más de quince minutos sin reportes, lo señala sin afirmar una causa. El panel consulta cambios cada minuto mientras está visible. No se confunde última revisión con fecha del último depósito.

Requiere aplicar la migración `20261028030000_belo_sync_status` y reemplazar Código.gs con su nueva versión. Las propiedades, claves y disparadores existentes se conservan. Si falla un envío de cobro o el reporte, no se avanza el cursor; los reintentos no duplican depósitos. Una versión vieja del agente puede seguir importando cobros, pero no reportará la fecha: se muestra sin registro hasta recibir el primer reporte válido. Los reportes no crean movimientos financieros ni contienen el correo.


## Incidente del 29/10/2026: rechazos nocturnos y recuperación

### Evidencia y límites del diagnóstico

- El usuario informó dos pendientes tras medianoche y aportó `showBeloReview`: ambos con `Aviso rechazado: revisar importe, moneda o fecha`. En la versión anterior esa cadena se genera **solo tras HTTP 422 del receptor**: Gmail ya había sido leído y el servidor había recibido ambos avisos.
- El parser anterior exigía `HH:mm:ss` (`\d{2}` para la hora). Una captura previa de Belo muestra asuntos con `0:50:52`; ese formato produce exactamente un rechazo de asunto, antes de convertirlo a UTC. Ahora se aceptan únicamente una o dos cifras para la hora, rango 0–23; se normaliza con cero inicial antes de convertirla. No se cambia la interpretación ARS ni se deducen importes.
- El usuario confirmó después los dos asuntos: `Aviso de operación - 29/10/2026 0:03:38` y `Aviso de operación - 29/10/2026 2:26:58`. Ambos incumplen exactamente la expresión anterior. Sus instantes correctos son `2026-10-29T03:03:38Z` y `2026-10-29T05:26:58Z`. Esa evidencia confirma la causa del rechazo de formato nocturno; la vista previa comprueba además el resto de las validaciones y la existencia del recibo antes de recuperar. No se afirma haber accedido al buzón, a Neon ni a los registros privados de Vercel/Apps Script desde el entorno de desarrollo.
- La consulta utiliza epoch Unix en segundos, no fechas calendario de Gmail. `29/10/2026 0:00:00` en Argentina equivale a `2026-10-29T03:00:00Z`; el día actual del dashboard empieza en ese instante y termina al inicio del siguiente día, exclusivo. El reloj UTC cambia tres horas antes que el día argentino. La zona del manifiesto es `America/Argentina/Cordoba`.
- No existe un cron de Vercel para esta integración en el repositorio. `setupBelo` crea el disparador de Apps Script cada cinco minutos. `diagnoseBeloSchedule` informa cuántos disparadores hay; no demuestra por sí solo que estén ejecutándose. Confirmar los horarios, tipo de ejecución y fallos en **Apps Script → Ejecuciones**. En Vercel → Logs filtrar `/api/integrations/belo` y los eventos `belo.rejected`, `belo.import_unavailable`. Un heartbeat solo certifica una revisión exitosa de página, no la salud de todos los correos.

### Corrección y protección de estados

Los rechazos devuelven códigos finitos (`SUBJECT_FORMAT`, `INVALID_DATE`, `INVALID_TIME`, `DATE_INCONSISTENT`, `BEFORE_ACTIVATION`, `RECEIVED_OUTSIDE_WINDOW`, `AMBIGUOUS_AMOUNT`, `AMOUNT_RANGE`, `NOT_ARS_DEPOSIT`, `INVALID_MESSAGE`). Apps Script conserva estos códigos, sin registrar la respuesta cruda ni el cuerpo del correo. Errores de lectura/decodificación se aíslan por mensaje; los fallos HTTP recuperables siguen deteniendo el avance de la página. Se verifica también el estado JSON de una respuesta exitosa antes de retirar un pendiente.

Los **nuevos** avisos rechazados se guardan con `retry:true`; se reintentan en lotes rotativos de cinco independientemente de la ventana de 24 horas. Los pendientes antiguos, sin esa marca, se reservan para la vista previa y recuperación explícita, incluso si reaparecen en una búsqueda normal. Si la cola llega a su límite de 50 avisos o de tamaño de propiedad, se detiene el avance en lugar de descartar registros antiguos. No se cambian propiedades de inicio ni se reinician cursores para recuperar.

`BeloImport.id` (SHA-256 del Message-ID) y `gmailMessageId` tienen unicidad persistente. La inserción del recibo y el ingreso anidado es atómica. Un conflicto se confirma consultando el recibo antes de devolver `duplicate`. Ningún reintento modifica operaciones existentes; tampoco restaura movimientos borrados que conservan su recibo. Una caída luego del commit y antes de responder se resuelve con el mismo recibo. **No hay deduplicación segura contra ingresos cargados manualmente sin recibo**: comprobarlos durante la vista previa. Tampoco se afirma identificar avisos distintos de Belo para una misma transferencia si carecen de un ID bancario común.

### Recuperar los dos pendientes sin un recorrido masivo

1. Desplegar el código del receptor corregido en Vercel y esperar **Ready**. No hay migración nueva ni cambios de variables. Mientras siga activo el agente anterior, su recorrido normal puede volver a enviar estos avisos al receptor ya corregido; si ya se acreditaron, la vista previa devolverá `duplicate` y no debe crearse una carga manual.
2. Reemplazar **Código.gs completo** con el archivo de esta carpeta y guardar. Conservar manifiesto, propiedades y disparador. No ejecutar `setupBelo` de nuevo ni pulsar Implementar.
3. Ejecutar **`previewBeloReview`**. Lee exclusivamente los IDs de `BELO_REVIEW` (máximo diez); utiliza una petición firmada de solo consulta. No crea ingresos ni mueve el cursor. Imprime para cada aviso: ID Gmail, `eligible`/`duplicate` o motivo de bloqueo; para los válidos muestra importe en centavos, fecha UTC e identificador de importación. Comparar contra los dos correos y el historial, incluyendo posibles cargas manuales. `99000` equivale a ARS 990; `03:15Z` equivale a 00:15 Argentina. Los importes y fechas solo aparecen en esta vista previa privada, no en los logs automáticos del servidor.
4. Si alguno queda `blocked`, **no forzar ni borrar la cola**. Revisar el motivo. Si ambos son los avisos correctos, confirmados y sin ingresos manuales equivalentes, ejecutar **`recoverBeloReview`** antes de 30 minutos. Esta acción acredita únicamente el plan revisado; vuelve a comprobar importe, instante e ID contra el servidor justo antes de enviar cada mensaje. Si el plan cambió o venció, exige repetir la vista previa.
5. Un aviso `duplicate` no crea ni modifica nada. Solo se retira de la cola tras recibir `created`/`duplicate` del receptor. Ante errores, conservar el plan y reintentar: los ya confirmados no se vuelven a acreditar. El plan se elimina tras completar la recuperación y el heartbeat.
6. Verificar en BOOSTIFY importe y fecha de los ingresos nuevos. Ejecutar `syncBelo` y comprobar que los totales no aumentan por esos mismos avisos. Revisar el siguiente disparador automático en Ejecuciones y el horario de última revisión del dashboard.

El modo preview del endpoint exige la misma firma HMAC y aplica las mismas validaciones que la acreditación; solo consulta recibos. Nunca se utiliza preview para saltar controles. Su resultado no reserva operaciones: la unicidad de PostgreSQL protege la carrera entre preview e inserción. No ejecutar importaciones históricas, borrar `BeloImport`, editar `BELO_IMPORT_START_AT` ni resetear la base.

### Verificación reproducible

`tests/belo-recovery.test.ts` cubre ambos lados de medianoche, horas sin cero inicial entre 0 y 9, UTC frente a Argentina, consulta epoch, formatos inválidos, varias páginas, cursor ante fallos, errores de lectura y de cuerpo, cola independiente del solapamiento, respuesta perdida después de commit, vista previa sin escrituras, planes vencidos/cambiados, rechazo ambiguo y recuperación repetida. `scripts/belo-integration.ts` comprueba contra PostgreSQL local la vista previa sin filas nuevas, respuesta de duplicado, restricciones únicas concurrentes y preservación de ediciones/tombstones. No ejecuta recuperación productiva.
