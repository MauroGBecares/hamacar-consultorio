# Contratos Supabase

La aplicación usa el cliente tipado generado en `core/data-access/database.types.ts`. No existe un backend REST propio bajo /api/v1.

| Área      | Lecturas                                                                                     | Comandos                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Acceso    | session_open, session_status, profiles                                                       | session_activity, session_close; Auth para contraseña                                                                                       |
| Pacientes | patient_page, patient_duplicates, detalle por UUID                                           | patient_command: save, manage                                                                                                               |
| Clínica   | clinical_page, borrador por paciente/autora/visibilidad                                      | clinical_command: draft, publish, con vínculo de rectificación                                                                              |
| Agenda    | agenda_read, agenda_next                                                                     | agenda_command: new, one, future, cancel-one, cancel-future                                                                                 |
| Economía  | finance_page, finance_scope, finance_slots, home_summary, finance_summary, finance_dashboard | finance_command: collection, correct, annul, detach, no-service, reopen, period-note, settlement-create, prepare, transfer, verify, observe |
| Auditoría | audit_page, bajo RLS                                                                         | generada por servidor                                                                                                                       |
| Archivos  | download-file                                                                                | upload_reserve, subida a Storage, finalize-upload                                                                                           |

Los comandos reciben acción, datos y UUID de operación. Las entidades persistidas incluyen versión; los slots de períodos y liquidaciones todavía no declarados son virtuales y no escriben en la base al navegar. El primer comando los materializa bajo restricciones únicas.

`finance_page` recibe entidad, ciclo/profesional/alcance, cursor, límite y revisión. Devuelve items, nextCursor y revision. Un informe recorre todas las páginas con la misma revisión; un cambio intermedio devuelve conflicto y exige regenerar. Los slots no representan deuda.

Las usuarias activas ven ocupación de agenda, pero reciben patientId y patientName nulos fuera de sus pacientes. La profesional desasignada pierde el acceso clínico y a los archivos, conservando sus snapshots económicos. Las socias no leen notas ni borradores privados de otras autoras.

Los documentos clínicos publicados y las transferencias verificadas son inmutables desde la aplicación. Corregir un registro clínico agrega una rectificación. Corregir o anular un cobro requiere ser autora, explicar el motivo y que su liquidación no tenga ninguna transferencia.

Las funciones de carga y descarga comprueban el JWT y la autorización actual. La opción de despliegue no-verify-jwt corresponde al gateway; no elimina la autenticación interna. cleanup-uploads solo admite su token exclusivo de servidor, compartido entre Vault y Edge Functions y enviado en `x-hamacar-cleanup-token`.

Los errores de comandos incluyen código y referencia de operación. Los logs del frontend no incluyen payload, texto clínico, tokens ni archivos. Para diagnóstico, conservar esa referencia, la pantalla y la hora, y consultar la auditoría o los logs del servidor.
