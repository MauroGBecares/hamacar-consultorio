# Publicar y administrar Hamacar

## Configuración de Vercel

El backend está en el proyecto Supabase **Implementacion Hamacar**. El propietario publica el frontend.

| Ajuste           | Valor                                                                                |
| ---------------- | ------------------------------------------------------------------------------------ |
| Root Directory   | `Hamacar-angular` si se sube el repositorio completo; `.` si esta carpeta es la raíz |
| Framework Preset | Angular                                                                              |
| Node.js Version  | `24.x`                                                                               |
| Install Command  | `npm ci`                                                                             |
| Build Command    | `npm run build`                                                                      |
| Output Directory | `dist/hamacar/browser`                                                               |

[Vercel admite Node 24 en sus builds](https://vercel.com/changelog/node-js-24-lts-is-now-generally-available-for-builds-and-functions). El paquete incluye el runtime 24.15 para que los comandos npm usen una versión compatible.

En **Settings → Environment Variables**, crear estas dos variables en Production:

```dotenv
HAMACAR_SUPABASE_URL=https://imuawsrkrrhzhaxyfmcy.supabase.co
HAMACAR_SUPABASE_PUBLISHABLE_KEY=sb_publishable_lf5gdRhdyPu5d9sdgkPb5g_IH8jPOrb
```

Son configuración pública. No configurar `service_role`, `sb_secret_...`, contraseñas de base de datos ni el token de la CLI en Vercel o Angular. Los permisos reales se comprueban en PostgreSQL y en las funciones de archivos.

El build genera `app-config.json` a partir de esas variables. Cambiarlas requiere un nuevo despliegue. Se versiona `.env.example`; `.env.local` y el archivo generado están ignorados. Las vistas previas que usen estas variables también apuntarán a producción: configurarlas solo si se desea ese acceso.

`vercel.json` incluye las rutas de la SPA, cabeceras de seguridad y exclusiones para archivos y workers. Tras publicar, abrir directamente `/pacientes`, recargar esa ruta y comprobar que aparece el acceso de Hamacar.

En Supabase → **Authentication → URL Configuration**, reemplazar Site URL por la URL HTTPS definitiva de Vercel. El acceso actual usa correo/contraseña, sin enlaces de recuperación, OAuth ni invitaciones; no necesita rutas callback ni comodines. Si después se agregan esos flujos, configurar sus URLs exactas.

## Crear la primera cuenta y las demás

1. Abrir Supabase → Authentication → Users → Add user → Create new user.
2. Indicar correo y contraseña de al menos 12 caracteres. Marcar la confirmación automática del correo para esta cuenta administrativa; no usar Invite user.
3. Copiar el UUID de la usuaria.
4. En Table Editor → `public.profiles`, buscar ese mismo UUID. La fila se crea automáticamente con `active=false`.
5. Completar `full_name`, `discipline`, `role` y luego `active=true`.

| Campo        | Valor                                                 |
| ------------ | ----------------------------------------------------- |
| `full_name`  | Nombre y apellido                                     |
| `discipline` | Disciplina profesional                                |
| `role`       | `professional` para profesional, `partner` para socia |
| `active`     | `true` para habilitar el acceso                       |

No agregar otra fila de perfil ni editar el UUID. El registro público está deshabilitado. La aplicación rechaza perfiles inactivos o incompletos; los roles no se toman de metadata editable de Auth.

Entregar las credenciales por un canal privado. La usuaria puede cambiarlas desde **Contraseña** dentro de Hamacar. **No hace falta SMTP para estos flujos.** No se implementaron invitaciones ni recuperación por correo.

## Baja, cambios y recuperación manual

Para una baja, cambiar `active=false` en profiles. El servidor deja de autorizar las operaciones, incluso con un token todavía vigente. Al volver a interactuar o recuperar foco, la aplicación bloquea la sesión. No borrar cuentas, perfiles ni sus registros: el historial conserva autora y referencias. Los cambios de perfil quedan auditados.

Una socia de Hamacar no obtiene acceso al panel Supabase. Cada administradora del backend debe usar su propia cuenta de Supabase, con acceso otorgado por el propietario.

Si una usuaria olvida su contraseña, una administradora puede usar esta herramienta local en Windows, desde la carpeta Angular y con la CLI autenticada:

```powershell
supabase login
./tools/supabase-admin.ps1 -Action reset-password -UserId UUID_DE_LA_USUARIA
```

Pide la nueva contraseña con entrada oculta, la cambia mediante la API administrativa y revoca las sesiones de Hamacar. No la guarda en archivos ni la imprime. Verificar la identidad de la titular y el UUID antes de ejecutarla. El mecanismo usa la [actualización administrativa de Auth](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), sin correo.

## Archivos y mantenimiento del backend

Los buckets `clinical-files` y `receipts` son privados. Las funciones desplegadas son `finalize-upload`, `download-file` y `cleanup-uploads`. Usan las credenciales suministradas por Supabase y un token exclusivo de limpieza, ya configurado. No hay que copiar secretos al frontend.

La limpieza diaria corre a las **03:15 de Argentina**. Retira cargas sin referencias de más de 24 horas, hasta 100 por ejecución. Conserva archivos de borradores, registros publicados y comprobantes, incluidos los reemplazados. El token exclusivo del trabajo está en Vault (`hamacar_cleanup_token`) y en Edge Functions (`HAMACAR_CLEANUP_TOKEN`); no concede acceso administrativo a otras API. Para rotarlo y sincronizar ambos destinos desde el equipo administrativo:

```powershell
./tools/supabase-admin.ps1 -Action test -Path tools/configure-cleanup.mjs
```

Ver ejecuciones en Cron y logs de Edge Functions. Una función deshabilitada, cuota agotada o proyecto pausado puede impedir operar: la interfaz informa el error y mantiene el texto pendiente mientras la pestaña permanezca abierta.

Para futuras modificaciones, agregar migraciones nuevas; no editar ni volver a aplicar las existentes. No ejecutar reset, seed ni restauraciones sobre este proyecto.

## Pendientes del propietario

- Publicar el frontend y establecer su URL definitiva.
- Crear y activar las cuentas reales; asignar equipos a los pacientes reales.
- Probar el dictado con micrófono en los dispositivos que se usarán.
- No cargar pacientes reales hasta completar una comprobación de acceso y permisos con esas cuentas.

Los respaldos quedaron expresamente fuera de esta etapa por decisión del propietario.
