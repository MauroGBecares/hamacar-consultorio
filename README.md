# Hamacar

Aplicación Angular 22.2 zoneless, standalone y organizada por funcionalidades. Usa Supabase Auth, PostgreSQL y Storage del proyecto **Implementacion Hamacar** (`imuawsrkrrhzhaxyfmcy`). El nombre del proyecto Angular sigue siendo `hamacar`.

## Ejecutar

Requiere Node 24.15 o posterior de la rama 24.

```sh
npm ci
```

Copiar `.env.example` a `.env.local`, reemplazar los dos valores de ejemplo por la URL y la clave publicable del proyecto Supabase y ejecutar:

```sh
npm start -- --port 4201
```

Usa el **Supabase de producción**: todo cambio confirmado se guarda allí. No existe acceso de demostración ni servidor Supabase local. Las cuentas se crean manualmente en Supabase.

## Publicar y administrar

- [Publicación en Vercel, variables y altas de cuentas](docs/produccion.md).
- [Arquitectura y mantenimiento](docs/arquitectura.md).
- [Contratos de datos y permisos](docs/api.md).
- [Plan aprobado](docs/plan-supabase.md).
- [Verificación y evidencia](docs/verificacion.md).

## Verificar cambios

```sh
npm run check:architecture
npm test
npm run build
npm run format:check
```

Las pruebas remotas son explícitas: crean cuentas ficticias y retiran sus datos al finalizar. Ver instrucciones y límites en la documentación de verificación. No ejecutarlas como parte del build de Vercel.
