# Cobros Belo desde Gmail

Integración opcional: Google Apps Script lee los correos de Belo cada cinco minutos y envía avisos firmados a BOOSTIFY. No pide credenciales de Belo, no manda correos ni cambia etiquetas, mensajes o estados de Gmail. Google ejecuta los horarios con posibles demoras y cuotas: no es tiempo real ni una conciliación bancaria.

## Alcance confirmado

Solo pesos argentinos y solo correos recibidos desde la activación. El titular confirmó que todos los depósitos de esta cuenta corresponden a BOOSTIFY. Se admite el remitente exacto `transaction@belo.app`, DMARC aprobado por Gmail, asunto `Aviso de operación - DD/MM/YYYY HH:mm:ss`, texto `Depósito exitoso` y frase `Tu cuenta de belo recibió un depósito de $…`. El símbolo `$` se interpreta como ARS por configuración expresa de esta cuenta; el correo de ejemplo no incluye código ISO. Se rechazan otras monedas explícitas. Se admite texto plano y HTML convertido a texto sin ejecutar su contenido. Si cambia la plantilla, se manda a revisión; no se adivina el importe. Los retiros no se registran como gastos.

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

Los recorridos usan páginas de 25 mensajes y un cursor de recepción con solapamiento de 24 horas, limitado por el inicio configurado. Los reintentos son seguros mediante unicidad en PostgreSQL, incluso en solicitudes simultáneas. Si Google invalida un token de página se reinicia el recorrido desde el último cursor completo. Retrasos de correo superiores al solapamiento o cambios en `internalDate` pueden requerir un recorrido manual; no se promete que un buzón sustituya el extracto bancario.

Para pausar, ejecutar `stopBelo` o poner `BELO_IMPORT_ENABLED=false` en Vercel y redesplegar. No borrar las filas de BeloImport ni mover la fecha de inicio hacia el pasado: eso afecta la protección contra reimportación y el alcance acordado.

## Pruebas de desarrollo

`npm test` cubre parser, firmas HMAC, origen DMARC, reintentos y avisos ambiguos. `npm run test:belo-integration` requiere un build previo y `TEST_DATABASE_URL` con una base exclusiva de pruebas migrada. Arranca el build en 127.0.0.1:3102 y verifica solicitudes firmadas contra PostgreSQL, carreras sin duplicados, edición preservada y borrado sin reimportar. Limpia únicamente los registros creados por esa ejecución. Nunca toma DATABASE_URL como fallback ni configura Gmail o producción.
