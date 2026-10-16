# Plan de integración de Hamacar con Supabase

Actualizado: **13 de octubre de 2026**. Estado: **integración implementada y verificada; publicación del frontend y cuentas reales a cargo del propietario**.

Este documento conserva las decisiones aprobadas y sus criterios de aceptación. Las tablas, permisos, comandos y funciones de archivos ya están creados en el proyecto remoto **Implementacion Hamacar**. El proyecto Angular sigue llamándose **hamacar**. El resultado de las comprobaciones se registra en [Verificación](verificacion.md) y la configuración necesaria para publicar está en [Producción](produccion.md).

| Entrega                                                   | Estado                                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Base, RLS, sesiones, auditoría y comandos transaccionales | Aplicados mediante 22 migraciones registradas                                                            |
| Supabase Auth                                             | Correo/contraseña, registro público deshabilitado, sin invitaciones ni SMTP                              |
| Archivos                                                  | Dos buckets privados, tres funciones Edge desplegadas y limpieza diaria programada                       |
| Frontend                                                  | Angular 22 zoneless por funcionalidades; lecturas con `rxResource` y escrituras confirmadas por servidor |
| Decisiones D1–D4                                          | Implementadas en interfaz y servidor; pruebas de permisos y concurrencia                                 |
| Despliegue en Vercel, URL definitiva y cuentas reales     | A cargo del propietario, siguiendo la guía de producción                                                 |
| Micrófono físico                                          | Comprobación pendiente en los dispositivos de uso                                                        |
| Respaldos                                                 | Fuera de esta etapa por decisión del propietario                                                         |

La revisión integral del 8 de octubre identificó errores de agenda, archivo de pacientes y navegación, además de riesgos de rendimiento e integración. Sus correcciones técnicas y pruebas se incorporan a continuación. El propietario confirmó las cuatro decisiones funcionales de esa revisión; están registradas como D1–D4 y forman parte del alcance de implementación.

## 1. Objetivo y decisiones acordadas

Reemplazar los datos y accesos de demostración de Hamacar Angular por persistencia real en Supabase, conservando Angular 22 zoneless, la arquitectura por funcionalidades y las reglas de negocio existentes, con las modificaciones expresamente acordadas aquí.

| Tema                  | Decisión                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto              | Usar `imuawsrkrrhzhaxyfmcy`, URL `https://imuawsrkrrhzhaxyfmcy.supabase.co`, como producción. Nombre visible: **Implementacion Hamacar**.      |
| Backend               | Crear y aplicar las tablas, relaciones, permisos y funciones directamente en ese proyecto mediante migraciones registradas en el código.       |
| Entorno local         | No instalar Docker ni ejecutar una base Supabase local. La CLI se utiliza para administrar el proyecto remoto.                                 |
| Presupuesto           | Solo servicios gratuitos. No contratar planes, complementos ni proveedores de pago.                                                            |
| Frontend              | Preparar Angular para desplegarlo en Vercel. El propietario se encarga de publicarlo.                                                          |
| Cuentas               | Altas, roles y activación desde el panel de Supabase, a cargo del propietario y las socias designadas.                                         |
| Correos               | Sin registro público, invitaciones ni SMTP. Recuperación de contraseña manual, administrada fuera de Hamacar.                                  |
| Sesiones              | Bloquear el acceso después de 30 minutos sin interacción, avisando antes y exigiendo nueva autenticación.                                      |
| Asignación clínica    | Al retirar a una profesional del equipo, pierde el acceso clínico, incluso a sus notas privadas y borradores. Conserva su historial económico. |
| Correcciones clínicas | La autora agrega una rectificación vinculada al original; no se sobrescribe el registro publicado.                                             |
| Edición simultánea    | Detectar cambios de versión, conservar el texto local y permitir comparar antes de guardar.                                                    |
| Sin conexión          | Conservar el texto únicamente mientras la pestaña siga abierta, mostrar que no se guardó y permitir reintentar.                                |
| Auditoría             | Registrar cambios en el servidor, incluidos roles y activación. No agregar auditoría de consultas o descargas.                                 |
| Pruebas               | Probar este mismo proyecto con datos ficticios identificados antes de habilitar pacientes reales; retirar los datos de prueba al finalizar.    |
| Actualizaciones       | Diseñar cambios compatibles con la versión publicada, sin interrupciones previstas por mantenimiento.                                          |

**Fuera de esta etapa:** respaldos, retención de copias, objetivos de pérdida de datos, tiempos de recuperación y pruebas de restauración. Estos puntos quedan postergados y no serán requisitos para avanzar con esta integración. También quedan fuera las invitaciones y administración de cuentas dentro de Hamacar, la publicación del frontend por parte del agente y la persistencia de borradores sin conexión en el dispositivo.

Las socias con privilegios administrativos en Supabase pueden acceder a datos fuera de los permisos de Hamacar. La privacidad de las notas frente a otras usuarias se aplica a la aplicación; no se presenta como protección frente a administradoras de la base. El propietario y cada administradora utilizarán su propia cuenta de Supabase; el rol de socia en Hamacar no concede automáticamente acceso al panel.

### Decisiones confirmadas tras la revisión integral

Confirmadas por el propietario el **8 de octubre de 2026**. Incorporadas al comportamiento, permisos y pruebas de la implementación.

| ID  | Tema                         | Decisión confirmada                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Transferencias sin conceptos | Exigir al menos un concepto vigente incluido antes de informar una transferencia, comprobado también en servidor. El importe transferido continúa siendo libre, sin exigir que coincida con la suma de conceptos.                                                                                                        |
| D2  | Correcciones económicas      | La autora puede corregir o anular sus cobros antes de cualquier transferencia de la liquidación que los incluye, retirar conceptos de una liquidación sin transferencias y reabrir «Sin prestación». Exigir motivo, original conservado y auditoría. Las socias mantienen su rol de revisión; no corrigen cobros ajenos. |
| D3  | Reservas tras desasignar     | Ocultar nombre e identificador del paciente en las reservas que ve la profesional desasignada, impedirle modificarlas o cancelarlas y dejar su gestión a las socias. Conservar ocupación y reservas, sin cancelación automática. La profesional conserva su historial económico.                                         |
| D4  | Límite horario de agenda     | Permitir cambios y cancelaciones únicamente antes de la hora de inicio efectiva del encuentro. Desde ese instante queda bloqueado también para las socias. Aplicar la hora de Argentina y las mismas reglas a ocurrencias desplazadas.                                                                                   |

D2 no habilita modificar conceptos congelados ni revertir transferencias verificadas. Las correcciones requieren control de versión, idempotencia, recálculo de sesiones y totales y conservación de las referencias históricas. Los cobros anulados quedan identificados y excluidos de los totales vigentes. Una operación económica incompleta no puede quedar visible como confirmada.

## 2. Arquitectura, contratos y seguridad

### Organización y acceso a datos

- Trabajar en `Hamacar-angular`, conservando el prototipo original. Mantener `core`, `shared`, `layout` y las funcionalidades `auth`, `patients`, `clinical-records`, `agenda`, `settlements` y `home`, con sus fronteras `public-api.ts`.
- Incorporar un único cliente tipado de `@supabase/supabase-js` en `core`. Los servicios de `data-access` de cada funcionalidad adaptan las respuestas remotas a su dominio. Los componentes y las reglas puras no acceden directamente a Supabase.
- Usar `rxResource` para las lecturas. El adaptador a observables propagará los errores del SDK, conectará la cancelación cuando el transporte lo permita y descartará respuestas pertenecientes a una sesión o consulta anterior. No convertir errores en listas vacías o importes cero.
- Usar comandos asíncronos explícitos para escribir. Los cambios de negocio se realizan mediante funciones PostgreSQL invocadas por RPC. Los comandos no se ejecutan desde recursos reactivos ni se reintentan automáticamente con identificadores nuevos.
- Adaptar también los formularios a esos comandos: indicar que se está guardando, impedir envíos duplicados y cerrar o avanzar únicamente tras una respuesta exitosa. Ante error, conservar los campos y el identificador de operación. Cerrar una pantalla o perder la conexión no demuestra que el servidor haya cancelado una escritura; reconciliar su resultado antes de repetirla.
- Usar funciones Edge de Supabase para validar los bytes de los adjuntos y gestionar su finalización y limpieza. Las operaciones sobre los objetos se hacen mediante la API de Storage; no se modifican directamente sus metadatos internos para simular cargas o borrados.
- Extender el control de arquitectura para impedir accesos al SDK desde páginas, componentes o dominio. Los fixtures quedan destinados a pruebas; no habrá retorno silencioso a datos simulados si Supabase falla.

### Contratos que cambian

| Contrato   | Definición                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidad  | UUID representado como `string` para usuarios, pacientes y entidades persistidas. Eliminar conversiones de rutas y selectores que supongan IDs numéricos.                                           |
| Perfil     | Identidad de Auth, nombre, disciplina, rol `partner` o `professional` y estado activo. Roles y activación no son editables por la usuaria desde la aplicación.                                      |
| Fechas     | Fechas civiles `YYYY-MM-DD`, períodos mensuales inequívocos y timestamps UTC del servidor. Mantener `America/Argentina/Cordoba` y quitar la fecha fija de demostración.                             |
| Dinero     | Centavos enteros no negativos según cada operación, con validación de rango y conversión segura a JavaScript. No usar coma flotante para calcular importes.                                         |
| Adjuntos   | Identificador y metadatos persistidos; `File` y las URLs blob son únicamente estado temporal del navegador.                                                                                         |
| Versiones  | Campo de versión para borradores y entidades editables o revisables. Cada comando presenta la versión que leyó.                                                                                     |
| Reintentos | Identificador de operación generado una sola vez para cada intención de guardado; el servidor conserva su resultado y reconoce repeticiones.                                                        |
| Errores    | Categorías estables: sesión inválida, acceso denegado/no encontrado, validación, conflicto de versión/negocio, límite de servicio y fallo temporal. Mensajes sin datos ajenos ni detalles internos. |

El servidor determina actor, autoría, propietario cuando corresponda, fechas de auditoría y estados protegidos. La clave publishable proporcionada es configuración pública del frontend. Los tokens de administración, credenciales de PostgreSQL y claves privilegiadas nunca se incorporan a Angular.

La configuración pública se cargará antes de inicializar los servicios; no se supondrá que Angular lee automáticamente variables de Vercel o archivos `.env`. La entrega incluirá el mecanismo de configuración usado y las instrucciones de build correspondientes.

### Modelo persistido

| Grupo           | Entidades y relaciones                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidad       | `profiles`, enlazado con `auth.users`, y control de sesiones de aplicación por `session_id`.                                                                               |
| Pacientes       | `patients` y `patient_team`, con unicidad del par paciente/profesional.                                                                                                    |
| Clínica         | `clinical_records`, rectificaciones vinculadas mediante `corrects_record_id`, `clinical_drafts` y relaciones con adjuntos. Un borrador por paciente, autora y visibilidad. |
| Agenda          | `booking_series` y `booking_exceptions`, con unicidad por serie y fecha original.                                                                                          |
| Economía        | `service_periods`, `collections`, `settlements`, `transfers` y notas relacionadas con su entidad.                                                                          |
| Archivos        | Metadatos propios de cargas y adjuntos; buckets privados separados para archivos clínicos y comprobantes.                                                                  |
| Soporte interno | Auditoría de cambios, registro de operaciones idempotentes y revisión económica para controlar la coherencia de exportaciones.                                             |

Los cambios de pacientes y equipo conservan el historial. Las bajas de profesionales se realizan por desactivación; no se proporciona borrado físico en Hamacar ni se utiliza eliminación en cascada desde Auth hacia historias, liquidaciones, perfiles históricos o autorías. Las migraciones impedirán que una eliminación administrativa accidental destruya esas referencias.

### Permisos efectivos

Crear permisos, restricciones y RLS en la misma migración que cada entidad. No conceder escritura directa sobre las tablas de negocio a `anon` ni a `authenticated`; las escrituras pasan por los comandos autorizados. Las lecturas directas se limitan a proyecciones y tablas cuyo RLS cubra íntegramente lo que se devuelve. Las consultas con ocultamiento de campos, agregados o comprobaciones especiales tendrán contratos de servidor propios.

| Recurso                         | Profesional activa                                                                                                                             | Socia activa                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Directorio                      | Identidad mínima necesaria para agenda y equipo; sin datos de autenticación.                                                                   | Igual, con los datos de gestión necesarios.                                                                      |
| Pacientes e historia compartida | Solo pacientes asignados.                                                                                                                      | Acceso clínico de gestión a los pacientes.                                                                       |
| Notas privadas y borradores     | Solo los propios, manteniendo acceso al paciente.                                                                                              | Solo los propios; el rol no permite leer los de otra autora desde Hamacar.                                       |
| Equipo y estado del paciente    | No administrar asignaciones o estados.                                                                                                         | Administrar con validaciones y motivo de cambio de estado.                                                       |
| Agenda                          | Editar sus reservas mientras mantenga la asignación y antes del inicio; tras desasignar, solo ocupación sin identidad del paciente ni edición. | Consultar y gestionar reservas autorizadas antes del inicio, incluidas cancelaciones tras una desasignación.     |
| Economía                        | Consultar, cargar y corregir operaciones propias dentro de los límites de D2, conservando el historial tras una desasignación clínica.         | Revisar y exportar; no cargar ni corregir cobros en nombre de otra profesional ni generar liquidaciones propias. |
| Archivos y auditoría            | Mismo alcance que su registro relacionado.                                                                                                     | Mismo alcance, respetando notas privadas y borradores.                                                           |
| Roles y activación              | Sin modificaciones desde Hamacar.                                                                                                              | Sin modificaciones desde Hamacar; gestión administrativa en Supabase.                                            |

Las comprobaciones de acceso usarán el perfil vigente en la base, no roles procedentes de metadatos editables por el usuario. Todas las funciones expuestas revalidan sesión, estado activo y acceso a los objetos involucrados. Las funciones privilegiadas tendrán `search_path` fijo, nombres cualificados y permisos de ejecución mínimos; revocar permisos por defecto de `PUBLIC` y `anon`. Las vistas expuestas respetarán RLS mediante `security_invoker`; las funciones que necesiten privilegios adicionales harán la autorización explícita.

La auditoría se genera dentro de la transacción que realiza el cambio. Es de solo lectura para la aplicación y sus permisos respetan el objeto y la visibilidad originales. No copiar contraseñas, tokens o contenido privado a una auditoría general. Para cambios del panel, registrar el origen administrativo y la identidad de base disponible; no inventar una autora humana cuando Supabase no la proporcione de forma verificable.

## 3. Comportamiento por funcionalidad

### Acceso, cuentas y sesiones

- Login con correo y contraseña, restauración de sesión antes de resolver guards, cierre de sesión y cambio de contraseña autenticado. El SDK administra los tokens; eliminar la contraseña y selección de identidad de demostración.
- Deshabilitar el registro público. Crear cuentas manualmente con correo confirmado; generar automáticamente un perfil inactivo, completar nombre, disciplina y rol desde Supabase y activarlo después. No exponer formularios de invitación ni recuperación por correo.
- Documentar la recuperación manual mediante las capacidades administrativas de Auth, preservando el UUID y la autoría. Si hace falta una utilidad administrativa, ejecutarla en el equipo del administrador con credenciales fuera del repositorio, nunca dentro de Angular. Verificar la identidad de la persona antes de restablecer su contraseña.
- Implementar el bloqueo de 30 minutos en Hamacar, sin depender de las opciones de timeout de pago de Supabase. Mostrar aviso al minuto 28. Actividad humana en una pestaña del mismo navegador mantiene activa esa sesión; refrescos de tokens y consultas automáticas no cuentan como interacción.
- Mantener un registro de sesión de aplicación asociado al `session_id` de Auth, con última actividad y revocación comprobadas en servidor. Actualizarlo de forma limitada mientras exista interacción. Una sesión vencida no puede reactivarse con su antiguo token: requiere un nuevo login y una nueva sesión. Los helpers de autorización aplican este control también a RPC y Storage.
- Comprobar el tiempo transcurrido al volver de una pestaña en segundo plano o de una suspensión del equipo. Al bloquear, ocultar datos y detener cargas, descargas y dictado. Conservar borradores ya guardados; el texto pendiente solo permanece en memoria y se recupera tras reautenticar a la misma usuaria. Un cambio de identidad lo descarta y limpia los recursos anteriores.
- La desactivación de un perfil bloquea inmediatamente nuevas operaciones de negocio mediante las políticas de servidor, aunque el navegador conserve un token todavía vigente.

### Pacientes, historia clínica y borradores

- Conservar datos y validaciones actuales de la ficha, autoasignación de la creadora, equipo válido y cambios de estado con motivo. Archivar conserva los registros y bloquea nuevas publicaciones y reservas. Las coincidencias de nombres requieren confirmación; una coincidencia ajena no revela identidad.
- Corregir el cambio de equipo de un paciente ya archivado: conservar su fecha y motivo de cierre cuando el estado no cambie. Asignar esos datos únicamente en una transición efectiva a Archivado; al reactivar, limpiar los datos de cierre vigentes y conservar la auditoría. Un motivo vacío en una edición de equipo no borra el motivo de archivo anterior.
- Aplicar la desasignación a fichas, historia, notas privadas, borradores, adjuntos y auditoría clínica. No eliminar esos datos ni trasladarlos a otra autora. El historial económico mantiene sus snapshots de nombre, disciplina, modalidad y cobertura.
- Una publicación y el retiro de su borrador forman una sola transacción. Fecha, contenido mínimo, cantidad de archivos, autoría y permisos se validan en servidor. Publicar requiere la versión vigente del borrador y un identificador de operación.
- Lo publicado y sus adjuntos son inmutables desde la aplicación. Rectificar crea otro registro vinculado, del mismo paciente, autora y visibilidad, con motivo y fecha del servidor. La autora debe seguir activa y tener acceso de escritura al paciente. Mostrar el original y las rectificaciones en orden; no introducir edición o borrado del original.
- Autoguardar con espera de un segundo sin cambios y una escritura pendiente por editor. Cada guardado compara versiones. Ante conflicto, conservar el texto local, mostrar la versión remota y permitir elegir o integrar el contenido; volver a validar la versión al guardar la resolución.
- El estado del editor distingue guardado, guardando, pendiente por conexión y conflicto. No marcar como guardado antes de la confirmación. Si se corta internet, mantener el contenido en memoria mientras exista la pestaña y ofrecer reintento; no guardar texto clínico en `localStorage`, IndexedDB ni una cola offline persistente.
- Mantener el dictado local. No guardar audio ni enviarlo a Supabase. La renovación de un recurso no debe reiniciar un formulario que la usuaria esté editando.

### Archivos y comprobantes

- Mantener hasta cinco adjuntos por registro clínico y diez MiB por archivo. Clínica acepta PDF, DOC, DOCX, JPG y PNG; comprobantes, PDF, JPG y PNG. Rechazar archivos vacíos y validar formato real, tamaño y estructura en el servidor, además de las ayudas del navegador. Esta validación no se presenta como análisis antivirus.
- Reservar una carga vinculada a usuaria, finalidad y destino autorizado. Usar rutas impredecibles generadas por servidor, sin nombres de pacientes. Subir a Storage con autenticación y sin sobrescritura.
- La función Edge de finalización verifica la sesión, el destino y el contenido; guarda tipo real, tamaño y huella del archivo. La publicación clínica o presentación de transferencia solo acepta cargas validadas, pertenecientes a la operación y no reutilizadas en otro destino.
- Las cargas pendientes son accesibles únicamente por su propietaria. Los archivos publicados heredan la autorización del registro clínico o transferencia. Descargar con autenticación y crear una URL blob temporal; revocarla al cerrar o cambiar de sesión. No generar enlaces públicos permanentes.
- Dar a los archivos temporales un ciclo de vida explícito: liberar objetos `File` al completar o descartar su carga y revocar las URLs de visualización al cerrar la vista o bloquear la sesión. Al salir o cambiar de identidad, cancelar operaciones y limpiar referencias de esa sesión; no depender de que se destruya un servicio global. Conservar los adjuntos persistidos y sus metadatos autorizados, sin descargarlos todos al abrir una lista.
- La carga y la escritura de negocio no se tratarán como una transacción única. Cada paso tendrá estado e identificador recuperables: una respuesta perdida permitirá consultar/repetir la finalización sin duplicar el registro.
- Un proceso de limpieza diario elimina, mediante la API de Storage, cargas fallidas o abandonadas sin referencias de más de 24 horas. Antes de borrar, bloquear el registro de carga y revalidar que no esté asociado o finalizándose; un estado de eliminación impide asociarlo después. Reintentar fallos sin marcar como eliminado un objeto que continúa presente.
- Conservar los archivos de borradores referenciados y todos los adjuntos publicados, incluidos los comprobantes reemplazados. La limpieza de cargas temporales no constituye un sistema de respaldos.

### Agenda

- Conservar tres consultorios, recurrencias únicas, semanales y quincenales, series sin fecha de fin, modificaciones de una ocurrencia y cambios desde una fecha futura. Mantener fechas originales de excepciones e historial previo a una división de serie.
- Corregir el truncamiento de series para preservar también encuentros adelantados: una ocurrencia originalmente del 9 de octubre, trasladada al 26 de septiembre, continúa visible al finalizar o dividir la serie desde el 2 de octubre. No descartar una excepción solo porque su fecha original sea posterior al corte si su fecha efectiva es anterior. Conservar su identidad, vínculo con la reserva original y auditoría, sin duplicarla en la serie resultante. Seguir tratando las excepciones anteriores desplazadas hacia el tramo cancelado.
- Trasladar la detección exacta de conflictos de consultorio, profesional y paciente a PostgreSQL. No introducir un horizonte arbitrario de algunos meses para validar recurrencias indefinidas. Los intervalos adyacentes continúan siendo válidos.
- Evitar comparar todas las parejas del historial en cada escritura. Identificar las series y ocurrencias afectadas por el comando y consultar candidatos por recursos compartidos y coincidencia temporal posible, con índices acordes y consideración de excepciones desplazadas. La reducción de candidatos no puede omitir cruces futuros de series indefinidas. Medir tiempos y planes de consulta con historial creciente; mover el algoritmo cuadrático al servidor sin reducir el trabajo no resuelve el hallazgo.
- Serializar las escrituras de agenda mediante un bloqueo transaccional común de agenda, apropiado para los tres consultorios actuales. Dentro de ese bloqueo, volver a leer series y excepciones y validar antes de guardar. Incluir cambios de equipo/estado que invaliden la operación en una comprobación coherente con la transacción.
- Al cancelar desde una fecha, tratar también las excepciones desplazadas al futuro. Rechazar cambios basados en versiones antiguas y reintentos con contenidos distintos. Los errores de conflicto muestran tipo y horario, sin identidad de pacientes ajenos.
- La lectura de ocupación devuelve una proyección autorizada; las profesionales no pueden consultar directamente series ajenas para recuperar datos ocultos. La próxima reserva se calcula a partir de series y excepciones, sin depender de descargar un año completo de calendario.
- «Próximo horario» muestra un encuentro cuyo inicio todavía no ocurrió; no devuelve uno terminado hoy. Actualizar la referencia de fecha y hora durante el uso, al cambiar de día y al recuperar foco tras una suspensión, sin reiniciar formularios en edición. Tanto el horario existente como el propuesto deben comenzar después del instante actual del servidor para aceptar una modificación. Rechazar cambios o cancelaciones desde el inicio efectivo, para todos los roles, incluidas ocurrencias desplazadas; no basta comparar fechas civiles.
- Al desasignar a una profesional, su agenda conserva únicamente la ocupación, sin nombre ni identificador del paciente y sin acciones de modificación o cancelación, incluso sobre sus reservas anteriores. Aplicar ese límite a listados, detalle, lectura de series, auditoría y comandos, sin permitir recuperar la identidad por otra ruta. Las socias gestionan las reservas futuras y pueden cancelarlas aunque la profesional ya no esté asignada o el paciente esté archivado; una nueva reserva o reprogramación debe cumplir las validaciones de equipo y estado. No cancelar automáticamente reservas ni reescribir el historial económico por una desasignación.

### Economía, inicio e informes

- Un período por paciente/profesional/mes y una liquidación por profesional/mes, garantizados mediante restricciones únicas. Consultar un mes devuelve casilleros vacíos sin crear registros; materializar al guardar la primera operación.
- Elegir Particular/Cobertura al primer cobro de cada paciente, profesional y mes; mantener esa modalidad después. Si antes se guarda una nota o declaración, el período puede permanecer sin modalidad hasta ese primer cobro.
- Validar en servidor sesiones realizadas y pagadas acumuladas, importes, fechas, declaración sin prestación, propiedad del cobro y pertenencia temporal al ciclo. Mantener snapshots históricos; cambiar la ficha o el equipo no reescribe conceptos anteriores.
- Un cobro solo puede incorporarse a una liquidación. Congelar sus conceptos cuando exista cualquier transferencia, incluso observada o reemplazada. Las socias revisan; las profesionales cargan sus propias operaciones.
- Exigir al menos un concepto vigente incluido para informar una transferencia, también si se accede directamente desde el detalle o se invoca el comando remoto. Comprobarlo dentro de la misma transacción que crea la transferencia; una retirada concurrente de conceptos no puede dejarla asociada a una liquidación vacía. Mantener libre el importe transferido y conservar el congelamiento desde cualquier transferencia.
- Incorporar corrección y anulación de cobros propios con motivo obligatorio, versiones e idempotencia, conservando el original y su auditoría. Un cobro pendiente de liquidar puede corregirse; si está incluido, solo mientras esa liquidación no tenga ninguna transferencia. Permitir retirar conceptos únicamente en ese mismo estado, dejando el cobro vigente pendiente de liquidar. Una corrección, anulación o retirada actualiza de forma atómica conceptos, sesiones acumuladas, estado del período, totales y revisión económica; no modifica snapshots de operaciones congeladas ni cambia silenciosamente la modalidad fijada al primer cobro. Las socias no ejecutan estas correcciones por otra profesional.
- Permitir que la autora reabra «Sin prestación» con motivo, control de versión y auditoría, únicamente mientras el período siga sin cobros ni conceptos asociados. Conservar la declaración original como antecedente y dejar el período disponible para cargar prestaciones y cobros. La existencia de transferencias en otros períodos no bloquea esta reapertura. Las transferencias verificadas continúan siendo inmutables.
- Presentar una transferencia exige comprobante validado. Verificar u observar requiere estado pendiente y versión vigente. Reemplazar una observada conserva el intento y comprobante anterior, lo marca reemplazado y crea el siguiente en la misma transacción. Una transferencia verificada no vuelve a un estado anterior en esta etapa.
- Bloquear las filas implicadas antes de validar y modificar períodos, conceptos y transferencias; adquirir los bloqueos siempre en el mismo orden. Una revisión simultánea debe producir un único cambio exitoso y un conflicto explícito para la otra operación.
- Conservar que «Confirmado» expresa recepción de una transferencia y no cancelación de una deuda. No agregar porcentajes automáticos, saldos exigibles ni nuevas reglas de cobranza. Mantener las definiciones actuales de los agregados económicos y sus fechas.
- Resolver listados con orden estable y paginación por cursor: 50 elementos por defecto y máximo 200 por página. Consultar agenda por rango visible y economía por ciclo; los totales se calculan en servidor sobre el conjunto autorizado, no sumando solamente la página cargada.
- Adaptar páginas, selectores, búsqueda e informes a consultas acotadas, en lugar de mantener un único `FinanceState` con todo el historial y su auditoría. Inicio y los indicadores consumen resúmenes autorizados independientes de las páginas del listado. Evitar recorridos repetidos del conjunto completo desde plantillas y clones íntegros del historial al cambiar cada filtro de exportación.
- Distinguir carga, error y consulta exitosa sin resultados en Inicio, resúmenes económicos, búsqueda y próxima reserva. Mostrar «Sin transferencias por revisar», cero ingresos o ausencia de reservas únicamente cuando la lectura correspondiente se haya confirmado; ante un fallo, mostrar el error y permitir reintentar.
- La exportación para socias conserva los filtros y las dos hojas actuales. Recuperar todas las páginas con una revisión económica común; si cambia durante la lectura, cancelar y ofrecer regenerar el archivo. Cada mutación económica actualiza esa revisión dentro de su transacción. No entregar archivos parciales ni incluir clínica, notas privadas o enlaces públicos de comprobantes.
- Recargar los recursos afectados tras una escritura exitosa y al recuperar foco/conexión. No agregar una dependencia obligatoria de Realtime en esta etapa.

### Reintentos y transacciones compartidas

Persistir una clave única por usuaria e identificador de operación, junto con tipo de comando, huella de entrada y resultado mínimo. Repetir la misma operación devuelve el resultado confirmado; reutilizar la clave con otro contenido devuelve conflicto. Comprobar de nuevo la autorización antes de devolver un resultado previo. La clave se conserva al reintentar una respuesta perdida.

Usar este mecanismo en altas de pacientes, publicaciones y rectificaciones, reservas, cobros y sus correcciones/anulaciones, retirada de conceptos, reapertura de «Sin prestación», presentación/reemplazo de transferencias y finalizaciones de cargas. Los borradores combinan identificador de operación y comparación de versión para que un guardado confirmado cuya respuesta se perdió no aparezca como un conflicto nuevo.

Las restricciones y comprobaciones del servidor son la autoridad. Las validaciones Angular siguen ofreciendo respuesta temprana y sus pruebas sirven como casos de referencia para las reglas SQL; no sustituyen esas validaciones.

### Navegación y conservación del trabajo

- Corregir «Saltar al contenido» para trasladar el foco al contenido principal de la ruta actual, sin navegar a la raíz ni recargar el documento. Comprobar su funcionamiento con teclado desde una ruta interna y con datos temporales en memoria.
- Evitar que la renovación de lecturas, el cambio de fecha civil o una respuesta tardía reemplacen campos que la usuaria esté editando. Mostrar el estado real de las operaciones y conservar el texto pendiente conforme a las decisiones de sesiones y borradores; no introducir almacenamiento clínico persistente en el dispositivo.

## 4. Ejecución y cambios compatibles

Antes de trasladar cada módulo a persistencia, convertir los errores reproducidos en casos de regresión y corregir sus reglas conforme a D1–D4. Adaptar los contratos afectados antes de implementar esos flujos. Las pruebas existentes del prototipo son una base de referencia, no una obligación de reproducir los defectos encontrados; actualizar las que consideraban «Sin prestación» un estado irreversible.

1. **Inspeccionar y enlazar.** Confirmar proyecto y organización antes de escribir, inspeccionar estructuras, usuarios y configuración remota. La CLI tuvo acceso comprobado el 6 de octubre; revalidarlo al implementar. No asumir que el proyecto sigue vacío ni aplicar resets, borrados generales o seeds de demostración.
2. **Crear la base y el acceso.** Aplicar migraciones versionadas de identidad, permisos, control de sesiones y auditoría; configurar Auth remoto. Incorporar cliente tipado, login real, bloqueo por inactividad y guards que esperan la sesión. Los ajustes de Auth del archivo local no se consideran automáticamente aplicados al proyecto remoto.
3. **Conectar pacientes y clínica.** Implementar equipo, estados, historia, rectificaciones y borradores con control de versiones. Activar los buckets y funciones de archivos antes de habilitar publicación con adjuntos.
4. **Conectar agenda.** Implementar lecturas autorizadas, comandos transaccionales y reglas de recurrencia y conflicto corregidas, con conservación del historial, retiro de permisos tras desasignar y bloqueo desde el inicio conforme a D3 y D4.
5. **Conectar economía e inicio.** Implementar períodos, cobros, correcciones previas a transferencias, liquidaciones, transferencias con conceptos, comprobantes, revisiones, agregados y exportaciones completas conforme a D1 y D2.
6. **Verificar y entregar.** Ejecutar las pruebas de la sección siguiente, retirar únicamente los datos identificados de prueba y entregar configuración y guía de publicación del frontend.

Cada migración crea sus restricciones y permisos de forma atómica cuando PostgreSQL lo permita. Las funciones Edge, buckets, ajustes de Auth y despliegue de Angular tienen verificaciones separadas; no se presentarán como una única transacción. Registrar qué pasos se aplicaron y poder repetir los pendientes sin duplicar datos.

Para actualizaciones posteriores, agregar primero estructuras y contratos compatibles, desplegar el backend que soporte ambas versiones y entregar el frontend preparado para que el propietario lo publique. No retirar contratos utilizados por la versión publicada ni hacer cambios destructivos en esta etapa. Limitar esperas por bloqueos; si un cambio no puede aplicarse sin interrupción prevista, detener ese cambio y conservar la versión operativa. La corrección de migraciones ya aplicadas se realiza mediante otra migración, sin editar su historial.

Preparar Vercel para servir la SPA desde `dist/hamacar/browser`, resolver rutas a `index.html` y cargar la configuración pública. El propietario publica y comunica la URL definitiva para completar la configuración que corresponda. No se requieren credenciales de Vercel para crear la persistencia.

Los fallos se mostrarán con mensajes útiles y un identificador de operación para diagnóstico. Los registros técnicos incluirán código, función y resultado, sin texto clínico, contraseñas, tokens ni contenido de archivos. No se agrega un proveedor de monitoreo de pago. Las actualizaciones compatibles no implican una garantía de disponibilidad del plan gratuito.

## 5. Pruebas, aceptación y entrega

### Verificaciones requeridas

| Área           | Casos que deben aprobarse                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Regresión      | Pruebas actuales de negocio adaptadas a UUID, reglas de arquitectura, formato y compilación de producción.                                                                           |
| Acceso real    | Login, perfil incompleto/inactivo, registro público rechazado, cambio de contraseña y recuperación manual documentada.                                                               |
| Sesiones       | Aviso y bloqueo a los 30 minutos, pestañas múltiples, suspensión del equipo, tokens antiguos, cierre, reautenticación y cambio de identidad sin filtración de datos.                 |
| Permisos       | Solicitudes directas a tablas, RPC y Storage como visitante, dos profesionales y dos socias. Rechazo de modificación de roles, escrituras directas y acceso por IDs ajenos.          |
| Clínica        | Desasignación que retira acceso incluso a notas propias, separación de notas privadas entre socias, archivo, publicación atómica y rectificación conservando el original.            |
| Borradores     | Dos pestañas con versiones distintas, respuesta tardía, respuesta perdida, fallo de conexión, reintento y publicación sin perder una edición concurrente.                            |
| Archivos       | Tamaño/tipo real, pertenencia, carga interrumpida, finalización repetida, sustitución rechazada, descarga autorizada y limpieza concurrente sin borrar archivos referenciados.       |
| Agenda         | Reservas simultáneas incompatibles, intervalos adyacentes, recurrencias indefinidas, excepciones desplazadas, cancelación futura y ausencia de identidades ajenas.                   |
| Economía       | Cobro repetido, primer cobro concurrente con distinta modalidad, acumulación de sesiones, conceptos únicos/congelados, revisión simultánea y reemplazo de comprobante con historial. |
| Informes       | Totales y Excel con más registros que una página, cambio concurrente durante la exportación, permisos y ausencia de datos clínicos.                                                  |
| Auditoría      | Generación en servidor, acceso acorde con la entidad, no manipulación desde el cliente y cambios administrativos sin autoría ficticia.                                               |
| Compatibilidad | La versión publicada puede seguir trabajando después de aplicar una migración aditiva; ausencia de fixtures y de credenciales privilegiadas en el build.                             |

### Regresiones incorporadas tras la revisión integral

| Área                    | Criterio de aceptación adicional                                                                                                                                                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Historial de agenda     | Finalizar y dividir series conserva ocurrencias adelantadas a una fecha anterior al corte, con fecha original y auditoría, sin duplicados. Mantener también las pruebas de excepciones desplazadas hacia el futuro.                                                                                                                           |
| Transferencias          | Rechazar una liquidación sin conceptos desde el formulario y el comando remoto. Probar la retirada concurrente del último concepto frente al envío de una transferencia. Aceptar un importe positivo distinto de la suma de conceptos cuando el resto de las validaciones se cumpla.                                                          |
| Correcciones económicas | Solo la autora corrige/anula cobros, retira conceptos o reabre «Sin prestación», con motivo, versión e idempotencia. Conservar originales, recalcular sesiones y totales, excluir anulaciones y rechazar correcciones de operaciones congeladas. Probar corrección frente a transferencia simultánea y reapertura seguida de un cobro válido. |
| Archivo de pacientes    | Modificar solo el equipo de un paciente archivado, también en una fecha posterior, conserva fecha y motivo de cierre. Reactivar conserva la auditoría del archivo.                                                                                                                                                                            |
| Horarios reales         | A las 20:00 no se presenta una reserva terminada a las 14:00 como próxima ni se permite modificarla o cancelarla. Probar antes del inicio, el instante exacto y después, para profesionales y socias; rechazar nuevos horarios que ya comenzaron. Incluir ocurrencias desplazadas, cambio de día y suspensión del equipo.                     |
| Desasignación y agenda  | La profesional desasignada ve ocupación sin identidad del paciente y no puede modificar/cancelar ni recuperar la identidad por detalle, series o auditoría. La socia puede cancelar una reserva futura sin reactivar la asignación. Conservar reservas e historial económico; rechazar acceso a ficha e historia clínica.                     |
| Navegación accesible    | «Saltar al contenido» mueve el foco correctamente desde una ruta interna y conserva URL de trabajo, sesión y datos temporales sin recargar la aplicación.                                                                                                                                                                                     |
| Escrituras asíncronas   | Con respuestas demoradas, fallidas y perdidas, no cerrar ni avanzar antes de confirmar éxito, no duplicar operaciones y conservar campos e identificador para reconciliar o reintentar.                                                                                                                                                       |
| Estados de lectura      | Una falla de consulta en Inicio, economía, búsqueda o próxima reserva no aparece como un resultado vacío confirmado. Mostrar carga/error y permitir reintento.                                                                                                                                                                                |
| Recursos y volumen      | Verificar liberación de referencias y URLs al cerrar vistas/sesión, listas mayores a una página y totales completos. Medir conflictos con series activas, terminadas, canceladas e indefinidas y excepciones; registrar volumen, entorno y tiempos, sin asumir que una prueba sintética equivale a capacidad productiva.                      |

Agregar recorridos automáticos de navegador para navegación, formularios y flujos críticos; complementar las pruebas de reglas y servicios existentes. El dictado requiere además una comprobación con micrófono y dispositivos reales, incluidos cancelación, cierre y bloqueo de sesión; no dar esa validación por realizada a partir del build o de la auditoría de dependencias npm.

Las pruebas SQL que puedan ejecutarse de forma aislada usarán transacciones revertidas con roles y claims de usuaria explícitos. No dar por validado RLS con una ejecución exclusiva como administradora de PostgreSQL.

Las pruebas de Auth, Storage, navegador y concurrencia utilizarán cuentas y datos ficticios persistidos temporalmente en el proyecto, antes del primer uso real. Se identificará cada ejecución mediante un manifiesto de UUID y rutas para retirar solo sus objetos. No se supondrá que un rollback SQL revierte peticiones HTTP, cuentas o archivos externos a esa transacción.

Usar al menos dos cuentas de profesional y dos de socia para comprobar privacidad entre pares. La creación de cuentas se hace administrativamente, sin invitaciones. Conservar evidencias de los resultados sin contenido clínico. Tras probar, retirar archivos mediante Storage, datos de negocio identificados y luego cuentas temporales, sin desactivar las protecciones de las tablas ni borrar información ajena a la ejecución.

Antes de habilitar el uso real debe comprobarse que cada módulo lee y escribe en Supabase, que la información reaparece al recargar o iniciar otra sesión autorizada, que las pruebas anteriores pasan y que no quedan datos ficticios. Una falla de permisos, integridad o persistencia impide marcar esta integración como terminada. No se exige configurar ni probar respaldos en esta etapa.

La entrega incluye migraciones aplicadas y su estado, tipos generados desde el esquema remoto, servicios integrados, pruebas, configuración pública del frontend y guías de altas/bajas, perfiles, recuperación manual de contraseña, publicación y diagnóstico. Los accesos administrativos de las socias y las credenciales personales se gestionan por el propietario; no se incorporan al repositorio.

### Referencias

- [Contratos implementados de Supabase](api.md).
- [Arquitectura del proyecto](arquitectura.md).
- [Angular: rxResource](https://angular.dev/api/core/rxjs-interop/rxResource).
- [Supabase: sesiones, límites y revocación](https://supabase.com/docs/guides/auth/sessions).
- [Supabase: seguridad de funciones PostgreSQL](https://supabase.com/docs/guides/database/functions).
- [Supabase: permisos de Storage](https://supabase.com/docs/guides/storage/security/access-control).
