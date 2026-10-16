import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const app = path.join(root, 'src/app');
const errors = [];
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : path.join(directory, entry.name),
      ),
    )
  ).flat();
}
function feature(file) {
  return file.replaceAll('\\', '/').match(/\/features\/([^/]+)\//)?.[1];
}
function resolveImport(from, specifier) {
  const alias = { '@core/': 'core/', '@shared/': 'shared/', '@features/': 'features/' };
  for (const [prefix, folder] of Object.entries(alias)) {
    if (specifier.startsWith(prefix)) return path.join(app, folder, specifier.slice(prefix.length));
  }
  return specifier.startsWith('.') ? path.resolve(path.dirname(from), specifier) : null;
}
for (const file of await files(app)) {
  if (!file.endsWith('.ts') || file.endsWith('.spec.ts') || file.endsWith('.mock.ts')) continue;
  const source = await readFile(file, 'utf8');
  const relative = path.relative(app, file).replaceAll('\\', '/');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      imports.push(node.moduleSpecifier.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const specifier of imports) {
    if (specifier.endsWith('.mock') || specifier.includes('/testing/'))
      errors.push(relative + ': las muestras de prueba no pueden importarse en producción.');
    if (specifier.startsWith('@supabase/') && !relative.startsWith('core/'))
      errors.push(relative + ': el SDK se encapsula en core.');
    const resolved = resolveImport(file, specifier);
    const target = resolved?.replaceAll('\\', '/');
    const targetFeature = resolved && feature(resolved);
    const sourceFeature = feature(file);
    if (
      sourceFeature &&
      targetFeature &&
      sourceFeature !== targetFeature &&
      !target.endsWith('/public-api')
    )
      errors.push(`${relative}: importar ${targetFeature} por public-api.`);
    if ((relative.startsWith('core/') || relative.startsWith('shared/')) && targetFeature)
      errors.push(`${relative}: core/shared no pueden depender de una funcionalidad.`);
    if (relative.startsWith('shared/') && target?.includes('/core/'))
      errors.push(`${relative}: shared no puede depender de core.`);
    if (
      relative.includes('/domain/') &&
      (specifier.startsWith('@angular/') ||
        specifier.startsWith('rxjs') ||
        target?.includes('/data-access/') ||
        target?.includes('/ui/') ||
        target?.endsWith('.service'))
    )
      errors.push(`${relative}: el dominio debe permanecer independiente de Angular y servicios.`);
    if (
      specifier === '@angular/common/http' &&
      !relative.includes('/data-access/') &&
      !relative.startsWith('core/') &&
      relative !== 'app.config.ts'
    )
      errors.push(`${relative}: HTTP pertenece a data-access/core.`);
  }
  if (/\b(innerHTML|outerHTML)\s*=|\bwindow\.[\w]+\s*=/.test(source))
    errors.push(`${relative}: evitar renderizado imperativo o funciones globales.`);
}
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (manifest.dependencies?.['zone.js'] || manifest.devDependencies?.['zone.js'])
  errors.push('El proyecto zoneless no debe depender de zone.js.');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Arquitectura validada: fronteras entre funcionalidades, dominio puro, HTTP encapsulado y ausencia de zone.js.',
  );
