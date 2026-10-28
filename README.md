# BOOSTIFY Control

Panel financiero privado para BOOSTIFY. Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, componentes de interfaz basados en shadcn/ui y Radix, PostgreSQL, Prisma ORM y Recharts. Solo ingresos efectivamente cobrados; no incluye clientes ni facturación.

## Desarrollo

Requiere Node.js 22.12+ (recomendado 24 LTS), npm y PostgreSQL 17. Usá el checkout existente; cada tarea de nube ya está aislada y no necesita un worktree.

1. `npm ci`
2. Copiá `.env.example` a `.env.local` sin sobrescribir un archivo existente.
3. Configurá las cuatro variables que se describen abajo.
4. `npm run db:generate`
5. `npm run db:migrate` para aplicar migraciones pendientes. Nunca usa `reset`, `db push`, borra tablas ni carga datos de muestra.
6. `npm run dev`

La página privada redirige a `/login`. Ingresá con el administrador configurado. No hay registro público ni administrador predeterminado. La base empieza vacía; agregá un movimiento real desde el botón «Nuevo movimiento».

### Variables

- `DATABASE_URL`: URL de PostgreSQL, con usuario, contraseña y nombre de base. En proveedores externos usá TLS (`sslmode=require` o el valor recomendado por tu proveedor). No subas esta URL a GitHub.
- `ADMIN_EMAIL`: único correo autorizado.
- `ADMIN_PASSWORD_HASH`: hash bcrypt, costo 12, generado con `npm run admin:hash`. El comando pide una contraseña de al menos 12 caracteres sin mostrarla. Copiá el hash en `.env.local` entre comillas simples para preservar los signos `$`. En Vercel pegá el hash sin comillas. Nunca guardes la contraseña en texto plano.
- `SESSION_SECRET`: secreto aleatorio de al menos 32 caracteres. Generá uno con `openssl rand -base64 48`. No compartas el valor ni lo incluyas en commits.

Prisma CLI carga `.env.local` y luego `.env`, sin reemplazar variables ya inyectadas. Next.js carga `.env.local` de forma nativa. No se usan variables `NEXT_PUBLIC_` para credenciales.

### PostgreSQL local opcional

Podés usar PostgreSQL instalado o un contenedor Docker oficial. Creá una base exclusiva y una contraseña propia, exponiendo el puerto únicamente en `127.0.0.1`. Conservá el volumen de datos y no ejecutes `docker compose down -v` ni borres volúmenes. La configuración de la nube puede disponer del contenedor `boostify-control-dev`; si existe, basta iniciarlo con `docker start boostify-control-dev`. La URL local queda en `.env.local`, ignorada por Git. No publiques esa URL como conexión de producción.

## Verificación

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Antes del primer typecheck generá Prisma. El build usa Webpack (opción soportada por Next.js 16) para evitar restricciones de procesos/puertos de Turbopack en entornos de nube. Genera el cliente, pero no consulta la base ni aplica migraciones. El panel requiere PostgreSQL disponible al ejecutarse. Los tests cubren sumas, pérdidas, margen con ingresos cero, conversión decimal a centavos, límites de enteros, categorías, fechas imposibles, cambios de mes/año, rango inclusivo local y fin exclusivo UTC, filtros y escape de CSV.

`npm run test:integration` requiere `TEST_DATABASE_URL` apuntando a una base **exclusiva de pruebas**, vacía o migrada, y un servidor PostgreSQL accesible. No usa `DATABASE_URL` como fallback. Crea registros identificados y elimina solamente los que creó. Verifica CRUD con Prisma y agregación financiera. Aplicá antes las migraciones con `DATABASE_URL` apuntando expresamente a esa base de pruebas: `DATABASE_URL='…' npm run db:migrate`.

## Fechas y dinero

`amountCents` es un entero positivo PostgreSQL de 32 bits (máximo ARS 21.474.836,47 por movimiento). El formulario acepta coma o punto decimal, sin separador de miles. La suma se calcula en centavos; el margen es `(ingresos - gastos) / ingresos * 100`, o cero sin ingresos. No hay saldos ficticios ni datos en localStorage.

`occurredAt`, `createdAt` y `updatedAt` se guardan como `TIMESTAMPTZ` en UTC. Una fecha del formulario representa el mediodía de Argentina. Presentación y filtros usan `America/Argentina/Cordoba`; el fin del rango corresponde al inicio del día siguiente, exclusivo. El mes actual va del primero hasta hoy. Los rangos personalizados admiten hasta dos años. Los filtros de tipo, categoría y período afectan el resumen, el gráfico diario, historial, gastos y CSV. La comparación de seis meses contempla todos los movimientos hasta hoy. El historial pagina de a 20 registros; el CSV incluye todos los resultados filtrados.

## Seguridad

Sesiones JWT firmadas HS256, duración de ocho horas, cookies httpOnly, sameSite=strict y secure en producción HTTPS. En desarrollo HTTP se permite cookie no secure. Rotar correo, hash o secreto invalida sesiones existentes. Autorización en layout, cada Server Action y exportación. Zod valida datos del servidor; Prisma parametriza consultas. Server Actions conservan la comprobación de origen de Next.js. No habilites orígenes adicionales sin necesidad.

El acceso admite hasta diez intentos por ventana global de quince minutos con contador persistido en PostgreSQL. No confía en IPs enviadas por el cliente. Es una aplicación para un administrador; una ráfaga externa puede bloquear temporalmente el acceso. Para mayor protección, habilitá protección de acceso y límites de tráfico de Vercel. El CSV neutraliza fórmulas en campos de texto. No se registran credenciales en logs de la aplicación.

## Despliegue en Vercel mediante GitHub

1. Subí este proyecto al repositorio `amyndevelop/boostify-finanzas`, rama `main`. Revisá `git status` y asegurate de excluir `.env.local`.
2. Creá PostgreSQL en un proveedor compatible (por ejemplo Neon o Supabase). Usá la conexión que indique el proveedor para Prisma; para migraciones usá conexión directa si su pooler no admite DDL.
3. Importá el repositorio en Vercel. Framework: Next.js. Node: 24.x. Instalación: `npm ci`. Build: `npm run build`.
4. Agregá las cuatro variables en Vercel, con valores de producción. Usá bases separadas para Preview y Production.
5. Desde un entorno confiable con la URL correcta, ejecutá `npm run db:migrate` antes de habilitar la aplicación. Las migraciones están versionadas; el build no las ejecuta automáticamente para evitar modificar datos al generar previews.
6. Desplegá, entrá por HTTPS y verificá login, alta/edición/eliminación y exportación CSV. Guardá copias de seguridad del proveedor y probá su restauración antes de cambios de esquema.

El repositorio está preparado para Vercel; crear código o pasar un build no implica que esté publicado ni conectado a una base externa.

## Red del entorno de nube

La instalación requiere `registry.npmjs.org` y `binaries.prisma.sh` (motor de migraciones y sus checksums oficiales). Conservá TLS y verificación de checksum. Si el proxy devuelve 403 para ese dominio, habilitalo en ajustes del entorno, guardá y reintentá. El runtime Prisma usa el adaptador oficial `pg` sin motor Rust.

## Automatización de cobros Belo (opcional)

El receptor firmado y el agente Gmail están en [integrations/belo-gmail](integrations/belo-gmail/README.md). La integración está desactivada por defecto y requiere la migración adicional, configuración en Vercel, y autorización del titular en Google Apps Script. Importa depósitos ARS desde la activación, categoría Otros, con prevención de duplicados. El código y las pruebas locales no establecen una conexión real a la cuenta de Gmail: la primera recepción de producción debe verificarse al activarla.

## Estadísticas y metas mensuales

El resumen compara los mismos filtros de tipo y categoría con el período anterior. Mes actual: del primero al día equivalente del mes anterior (limitado al último día si ese mes es más corto). Mes anterior: dos meses completos. Hoy, semana y rango personalizado: intervalo inmediatamente anterior de igual duración. Las fechas comparadas se muestran en pantalla. Los porcentajes de variación requieren base positiva; si no existe, se muestra el cambio absoluto sin inventar porcentajes. El margen se compara en puntos porcentuales.

La cantidad de cobros cuenta movimientos de ingreso, no pedidos ni clientes. El cobro promedio es la suma en centavos dividida por esa cantidad, redondeada al centavo. Respeta los filtros elegidos.

La meta de ganancia se define desde el panel para el mes actual y se guarda en PostgreSQL, sin valor predeterminado ni cambios en los ingresos. Muestra ganancia neta, avance, faltante y ganancia diaria necesaria, incluyendo hoy entre los días restantes. Contempla pérdidas y metas superadas. Usa todos los movimientos del mes actual hasta hoy, independientemente de los filtros. Cada mes conserva su propia meta; no se renueva automáticamente.

Antes de habilitar metas en producción, aplicar `npm run db:migrate` a Neon con conexión directa. La migración crea solamente `MonthlyGoal`, sin modificar movimientos ni importaciones Belo. Mientras esa tabla no exista, la meta indica indisponibilidad y los demás indicadores continúan funcionando. No se ejecutan migraciones durante el build ni se inventa una meta.

### Resumen de hoy

El bloque «Hoy en BOOSTIFY» muestra ingresos, gastos, ganancia, margen, cantidad de cobros y cobro promedio del día actual en Argentina. Usa desde las 00:00 locales hasta las 00:00 del día siguiente (fin exclusivo), con todos los tipos y categorías. Sigue visible al consultar otros períodos o filtros. Se actualiza con la consulta periódica del panel cada minuto mientras está visible; los correos nuevos dependen además de la revisión programada de Gmail. No necesita nuevas variables ni migraciones.
