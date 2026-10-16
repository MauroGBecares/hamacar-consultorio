# Verificación de Hamacar con Supabase

Revisión de cierre: **13 de octubre de 2026**. Proyecto remoto: `imuawsrkrrhzhaxyfmcy` (**Implementacion Hamacar**). Se usan cuentas y datos ficticios identificados por ejecución. El prototipo original permanece separado.

## Comprobaciones locales

| Comprobación                          | Resultado                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm test`                            | **45 pruebas aprobadas en 11 archivos**                                                       |
| `npm run build`                       | Producción compilada sin advertencias                                                         |
| `npm run check:architecture`          | Fronteras entre funcionalidades, dominio puro, SDK encapsulado y ausencia de Zone verificadas |
| `npm run format:check`                | Formato correcto                                                                              |
| Herramienta administrativa PowerShell | Sintaxis analizada sin errores                                                                |

Bundle inicial: **524,70 kB**, transferencia estimada **132,07 kB**. Las funcionalidades se cargan de forma diferida. Salida: `dist/hamacar/browser`.

Las pruebas unitarias cubren fechas y dinero, recurrencias, reglas de presentación económica, Excel, cancelación de lecturas, errores de servidor, versiones, reintentos con la misma intención y limpieza al cambiar de identidad. El editor zoneless conserva fecha, horario y consultorio al cambiar la profesional. Las antiguas pruebas de permisos sobre mocks se sustituyeron por comprobaciones reales de SQL, Auth y Storage; la cantidad de pruebas unitarias no representa por sí sola toda la cobertura.

## Base de datos y permisos reales

`supabase/tests/01_permissions_and_commands.sql` pasó utilizando roles y claims explícitos de dos profesionales y dos socias. Sus datos se revierten dentro de una transacción. Comprueba comandos, idempotencia, RLS, privacidad clínica, conflictos y requisitos económicos.

`tools/integration.mjs` comprueba el sistema mediante JWT reales de cuatro cuentas temporales. El resultado de la última ejecución, su identificador y la confirmación de limpieza se guardan en [integration-latest.json](evidence/integration-latest.json). Una ejecución fallida también queda registrada; solo `failure: null` y `cleaned: true` acreditan un recorrido completo con limpieza.

| Área                | Casos comprobados                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                | Perfiles inicialmente inactivos, registro público rechazado, roles no editables por usuarias, ingreso real y baja de perfil                              |
| Contraseñas         | Cambio autenticado, recuperación administrativa sin correo, revocación de sesiones anteriores y nuevo ingreso                                            |
| Pacientes y clínica | RLS entre cuatro identidades, notas privadas incluso entre socias, versiones de borrador, reintentos y rectificación sin sobrescritura                   |
| Archivos            | PNG real validado, estructura inválida rechazada, sustituciones y descargas ajenas bloqueadas, finalización repetida                                     |
| Agenda              | Reservas concurrentes, adyacencia, recurrencias indefinidas, excepciones desplazadas, archivo, desasignación y límite de inicio D3/D4                    |
| Economía            | D1/D2, primer cobro repetido, modalidades concurrentes, correcciones auditadas, sesiones acumuladas, retiro frente a transferencia y revisión simultánea |
| Historial           | Más de 50 liquidaciones, cursores sin duplicados, conceptos pendientes accesibles desde liquidaciones sin transferencias y consultas acotadas            |
| Informes            | Revisión global que rechaza exportaciones inconsistentes y exportación completa de más de una página                                                     |
| Sesiones            | Vencimiento real impuesto por servidor, token vencido que no puede reabrirse y acceso revocado por perfil inactivo                                       |
| Limpieza            | Peticiones de usuarias rechazadas, cargas abandonadas retiradas y archivos publicados conservados                                                        |

Las carreras se ejecutan como solicitudes simultáneas, verificando que solo una operación incompatible confirme sus cambios. Las cuentas, UUID y rutas de objetos de cada ejecución se registran en un manifiesto local ignorado por Git, sin contraseñas ni tokens. La limpieza usa la API de Storage antes de retirar las filas y cuentas identificadas; no borra datos ajenos a ese manifiesto.

## Navegador con backend remoto

`tools/browser-checks.mjs` sirve temporalmente el build de producción y usa Chromium con zona horaria de Argentina. No utiliza respuestas simuladas para los recorridos de persistencia:

- Ingreso por una ruta protegida, retorno a esa ruta, restauración tras recarga y salto accesible al contenido sin recargar.
- Autoguardado de nota privada, recarga, conflicto con otra escritura, comparación y resolución conservando el texto local.
- Corte de conexión, conservación del texto mientras la pestaña permanece abierta, reintento y publicación confirmada.
- Vencimiento del servidor que cierra los diálogos privados; reautenticación de la misma autora y recuperación del texto pendiente.
- Edición de ficha y creación de reserva, ambas recuperadas después de recargar.
- Cobro parcial, transferencia de importe libre, carga y descarga de comprobante privado.
- Historial económico, salida y cambio de identidad a socia, panel y descarga efectiva de Excel con más de 120 filas entre ambas hojas.
- Escritorio de 1440 × 1000 y móvil de 390 × 844, sin desbordamiento horizontal del documento ni errores JavaScript.

Capturas con datos exclusivamente ficticios: [escritorio](evidence/browser-dashboard.png) y [móvil](evidence/browser-mobile.png).

## Volumen de agenda

Medición realizada el **9 de octubre**, después de optimizar las consultas: **1.000 series**, con 500 terminadas, 250 excepciones canceladas y 250 series indefinidas. La lectura semanal de 250 encuentros visibles tardó **403,443 ms** y la validación de una nueva serie **1.345,864 ms**, medidas con `clock_timestamp` en Supabase remoto Free, región `ca-central-1`.

Se comprobó también el rechazo en el instante exacto de inicio. Los datos del ensayo se revirtieron. Evidencia: [agenda-volume.json](evidence/agenda-volume.json); ensayo reproducible en `supabase/tests/02_volume_and_time.sql`. Esta ejecución sintética con horarios de un minuto no garantiza capacidad o latencia bajo carga productiva.

## Estado de entrega y límites

El backend contiene **22 migraciones registradas**, dos buckets privados y tres funciones Edge. `supabase/health.sql` comprueba RLS, ausencia de escrituras directas autenticadas, ausencia de RPC de negocio públicas, conteos de datos, tarea de limpieza y resultados HTTP sin consultar secretos. Su resultado de cierre está en [backend-health.json](evidence/backend-health.json).

La comprobación detectó y corrigió un rechazo de autenticación del trabajo de limpieza. Se configuró un token exclusivo en Vault y Edge Functions y se probó también el comando que ejecuta la tarea mediante `pg_net`. Un estado `succeeded` de Cron por sí solo solo acredita que envió la solicitud: también debe comprobarse su respuesta HTTP.

Pendientes del propietario: publicación en Vercel, URL definitiva y cuentas reales. No se verificó micrófono físico ni compatibilidad exhaustiva con otros navegadores, lectores de pantalla o versiones de Microsoft Excel. Las capturas antiguas en `docs/capturas` corresponden al prototipo y no acreditan esta integración. Los respaldos están fuera del alcance acordado.

## Repetir las comprobaciones

Comprobaciones locales, desde `Hamacar-angular`:

```sh
npm ci
npm run check:architecture
npm test
npm run build
npm run format:check
```

Las comprobaciones remotas requieren la CLI autenticada y modifican el proyecto de producción con datos ficticios temporales. Deben ejecutarse expresamente, antes de habilitar el uso real; no forman parte del build de Vercel. Desde PowerShell:

```powershell
./tools/supabase-admin.ps1 -Action query -Path supabase/tests/01_permissions_and_commands.sql
./tools/supabase-admin.ps1 -Action query -Path supabase/tests/02_volume_and_time.sql
$env:HAMACAR_BROWSER_TEST='1'
try {
  ./tools/supabase-admin.ps1 -Action test -Path tools/integration.mjs
} finally {
  Remove-Item Env:HAMACAR_BROWSER_TEST -ErrorAction SilentlyContinue
}
./tools/supabase-admin.ps1 -Action query -Path supabase/health.sql
```

El recorrido de navegador requiere Chromium instalado para Playwright (`npx playwright install chromium`). Las credenciales administrativas se recuperan del almacén de Windows y permanecen en memoria; no se imprimen ni se incorporan al build. Si se interrumpe el proceso antes del bloque de limpieza, revisar el manifiesto `.tools/integration-<UUID>.json` y retirar únicamente sus datos identificados antes de volver a probar.
