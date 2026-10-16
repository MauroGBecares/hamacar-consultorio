# Arquitectura de Hamacar

## Organización

```text
src/app/
  core/
    config/          configuración pública validada antes de arrancar
    data-access/     cliente Supabase tipado, comandos, auditoría y errores
    identity/        sesión, roles y guard de acceso
    files/           cargas, descargas y recursos temporales
    time/            reloj civil de Argentina
  shared/
    models/          contratos simples y puertos de UI
    ui/              diálogos, adjuntos y estados de recursos
    utils/           fechas, moneda y texto
  features/
    auth/
    home/
    patients/
    clinical-records/
    agenda/
    settlements/
  layout/            navegación y bloqueo de la aplicación
supabase/
  migrations/        historial SQL aplicado al proyecto remoto
  functions/         validación, descarga y limpieza de archivos
  tests/             comprobaciones SQL con datos revertidos
tools/               configuración, verificación y administración explícita
```

Cada funcionalidad separa páginas, UI, acceso a datos y dominio. La comunicación entre funcionalidades usa `public-api.ts`. Core y shared no dependen de features; shared tampoco importa core. Sus necesidades de archivos y bloqueo se expresan mediante tokens de inyección proporcionados por la aplicación.

Componentes standalone, rutas diferidas y detección de cambios zoneless. La compilación es estricta. `check:architecture` comprueba las fronteras, la pureza del dominio, la encapsulación del SDK y la ausencia de importaciones de fixtures en producción.

## Lecturas y escrituras

Las lecturas usan `rxResource` con parámetros reactivos y el adaptador cancelable `remote`. La desuscripción aborta la petición y descarta respuestas tardías. Los componentes muestran carga, error, vacío y reintento. Un refresco no reemplaza campos de un formulario abierto.

Los comandos son acciones explícitas; no se disparan desde recursos reactivos. Cada intención tiene un UUID, una versión esperada y una huella del contenido. Un reintento conserva el contenido original hasta conocer el resultado; el servidor devuelve el mismo resultado sin duplicar la operación. Cambiar la intención genera otro UUID.

Los conflictos funcionales usan `PT409`, porque `40001` está reservado a fallos transitorios y puede provocar reintentos automáticos en PostgREST. Las validaciones SQL son la autoridad; Angular ofrece respuesta temprana.

## Seguridad y conservación

RLS limita lecturas. Los comandos con privilegios controlados validan sesión, perfil, rol, asignación, autora y versiones. Las tablas de negocio no aceptan escritura directa desde el cliente. Las funciones internas viven en un esquema no expuesto, con permisos explícitos y search_path fijo.

La sesión de Hamacar vence tras 30 minutos de inactividad, independientemente de la renovación del token Auth. Las pestañas comparten solo el instante de actividad y el identificador de sesión. Los formularios se ocultan y sus diálogos se cierran al bloquear; el texto propio puede retomarse tras autenticarse con la misma cuenta. Cambiar de identidad limpia memoria y reinicia la navegación.

Los borradores se guardan con debounce de un segundo y escrituras serializadas. Una edición simultánea conserva el texto local y exige comparar con el remoto. La memoria temporal no es almacenamiento sin conexión: recargar o cerrar la pestaña pierde texto que no llegó al servidor.

Los archivos se reservan, suben y validan antes de asociarse. Descargarlos requiere una nueva autorización en el servidor mediante POST y respuesta no-store. No se ofrecen URLs públicas ni firmadas. Los objetos File y URLs blob tienen limpieza al completar, cerrar o bloquear la sesión.

## Volumen y cambios posteriores

Pacientes, clínica e historial usan páginas de 50 elementos. Las consultas económicas del ciclo reconstruyen sus páginas bajo una revisión común; el historial usa una selección acotada por cursor. Los indicadores se agregan en el servidor sobre todo el conjunto autorizado. Exportar todo el historial es una acción explícita que recorre todas las páginas y aborta si cambia la revisión.

La agenda consulta solo el rango visible, incluyendo excepciones que quedaron fuera de una serie truncada. Los conflictos se verifican sobre las series involucradas y sus recurrencias exactas, sin descargar la agenda completa.

Los importes viajan como centavos enteros. Las fechas civiles usan America/Argentina/Cordoba; los instantes del servidor gobiernan las restricciones horarias.

Las migraciones aplicadas son inmutables. Agregar contratos compatibles antes de publicar un frontend nuevo; generar nuevamente los tipos desde el esquema remoto y ejecutar las verificaciones. El archivo config.toml sirve a la CLI y no implica que se ejecute Supabase local.
