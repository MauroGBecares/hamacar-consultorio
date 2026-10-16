import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

export async function browserChecks({ accounts, patientId, run, pass, sql, png }) {
  const root = resolve('dist/hamacar/browser');
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  };
  const server = createServer(async (request, response) => {
    try {
      let path = resolve(
        root,
        '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname),
      );
      if (path !== root && !path.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      if (!extname(path) || !(await stat(path).catch(() => null))?.isFile())
        path = resolve(root, 'index.html');
      response.writeHead(200, {
        'Content-Type': types[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(await readFile(path));
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'America/Argentina/Cordoba',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const login = async (account = accounts[0]) => {
    console.log('BROWSER: autenticación ' + (account === accounts[0] ? 'profesional' : 'socia'));
    await page.getByLabel('Correo electrónico').fill(account.email);
    await page.locator('input[name="password"]').fill(account.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Salir', exact: true })).toBeVisible({
      timeout: 25000,
    });
  };
  const openNote = async () => {
    await page.getByRole('button', { name: 'Mis notas', exact: true }).click();
    await page.getByRole('button', { name: '＋ Crear nota privada', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('¿Qué querés registrar?')).toBeVisible();
  };
  try {
    console.log('BROWSER: ingreso y restauración');
    await page.goto(base + '/pacientes/' + patientId);
    await login();
    await expect(page).toHaveURL(base + '/pacientes/' + patientId);
    const navigation = await page.evaluate(() => performance.timeOrigin);
    await page.getByRole('link', { name: 'Saltar al contenido' }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => performance.timeOrigin), navigation);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
    await page.reload();
    await expect(page.getByRole('heading', { name: /Paciente económico ficticio/ })).toBeVisible({
      timeout: 20000,
    });
    pass('Navegador: ingreso real, ruta protegida, restauración y salto al contenido sin recarga');

    console.log('BROWSER: borrador, desconexión y publicación');
    await openNote();
    const text = 'Nota privada ficticia de navegador ' + run;
    await page.getByLabel('¿Qué querés registrar?').fill(text);
    await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.reload();
    await openNote();
    await expect(page.getByLabel('¿Qué querés registrar?')).toHaveValue(text);
    const remoteDraft = await accounts[0].client
      .from('clinical_drafts')
      .select('*')
      .eq('patient_id', patientId)
      .eq('visibility', 'private')
      .single();
    assert.equal(remoteDraft.error, null);
    const concurrent = await accounts[0].client.rpc('clinical_command', {
      p_action: 'draft',
      p_input: {
        patientId,
        visibility: 'private',
        date: remoteDraft.data.date,
        text: 'Otra edición ficticia',
        version: remoteDraft.data.version,
        files: [],
      },
      p_operation: crypto.randomUUID(),
    });
    assert.equal(concurrent.error, null);
    await page.getByLabel('¿Qué querés registrar?').fill(text + ' edición local');
    await expect(page.getByRole('heading', { name: 'Compará antes de guardar' })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText('Otra edición ficticia', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Conservar mi edición sobre esta versión' }).click();
    await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await context.setOffline(true);
    await page.getByLabel('¿Qué querés registrar?').fill(text + ' sin conexión');
    await expect(page.getByRole('button', { name: 'Reintentar guardado' })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByLabel('¿Qué querés registrar?')).toHaveValue(text + ' sin conexión');
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Reintentar guardado' }).click();
    await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole('button', { name: 'Guardar nota privada', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(text + ' sin conexión', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    pass(
      'Navegador: borrador persistido tras recargar, texto conservado sin red y publicación confirmada',
    );

    console.log('BROWSER: bloqueo con formulario abierto');
    await openNote();
    await page.getByLabel('¿Qué querés registrar?').fill('Texto conservado durante bloqueo ' + run);
    await expect(page.getByText('Borrador guardado', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await sql(
      `update hamacar.app_sessions set last_activity=now()-interval '31 minutes' where user_id='${accounts[0].id}';`,
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByLabel('Correo electrónico')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await login();
    if (!(await page.locator('dialog[open]').count())) await openNote();
    await expect(page.getByLabel('¿Qué querés registrar?')).toHaveValue(
      'Texto conservado durante bloqueo ' + run,
    );
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    pass(
      'Navegador: bloqueo cierra diálogos privados y reautenticación conserva el borrador de la autora',
    );

    console.log('BROWSER: ficha y reserva');
    await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
    await page.getByLabel('Familiar / Responsable').fill('Responsable ficticio del navegador');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText('Responsable ficticio del navegador', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Agenda', exact: true }).click();
    await page.getByRole('button', { name: '＋ Nueva reserva', exact: true }).click();
    const bookingDialog = page.getByRole('dialog'),
      future = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await expect(
      bookingDialog
        .locator('select[name="patient"] option')
        .filter({ hasText: 'Paciente económico ficticio' }),
    ).toHaveCount(1);
    await bookingDialog
      .locator('select[name="patient"]')
      .selectOption({ label: 'Paciente económico ficticio ' + run });
    await bookingDialog.locator('input[name="start"]').fill(future);
    await bookingDialog.getByLabel('Desde', { exact: true }).fill('19:00');
    await bookingDialog.getByLabel('Hasta', { exact: true }).fill('19:30');
    await bookingDialog.getByLabel('Frecuencia').selectOption({ label: 'Solo esta vez' });
    await bookingDialog.getByRole('button', { name: 'Confirmar reserva' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await page.getByLabel('Fecha de la agenda').fill(future);
    await expect(
      page.getByRole('button').filter({ hasText: 'Paciente económico ficticio ' + run }),
    ).toBeVisible({ timeout: 20000 });
    pass('Navegador: edición de ficha y reserva guardadas y recuperadas tras recarga');
    console.log('BROWSER: liquidaciones e historial');
    await page.getByRole('link', { name: 'Liquidaciones', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Mis liquidaciones', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('No se pudo confirmar la operación.', { exact: false }),
    ).toHaveCount(0);
    await page
      .getByRole('button')
      .filter({ hasText: 'Sin prestación ficticia ' + run })
      .click();
    await page.getByLabel('Sesiones realizadas del período').fill('100');
    await page.getByLabel('Sesiones de este cobro').fill('1');
    await page.getByLabel('Importe que indicás para Hamacar (ARS)').fill('123,45');
    await page.getByRole('button', { name: 'Confirmar cobro' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver detalle', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar transferencia', exact: true }).click();
    await page.getByLabel('Monto transferido (ARS)').fill('42,30');
    await page
      .getByLabel('Comprobante obligatorio')
      .setInputFiles({ name: 'comprobante-navegador.png', mimeType: 'image/png', buffer: png() });
    await page.getByRole('button', { name: 'Enviar a revisión', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Registrar transferencia', exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: /comprobante-navegador.png/ })).toBeVisible({
      timeout: 20000,
    });
    const receiptDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: /comprobante-navegador.png/ }).click();
    assert.equal((await receiptDownload).suggestedFilename(), 'comprobante-navegador.png');
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    pass(
      'Navegador: cobro, transferencia de importe libre, comprobante validado y descarga privada',
    );
    await page.getByRole('button', { name: 'Historial', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Historial de liquidaciones' })).toBeVisible({
      timeout: 25000,
    });
    await expect(page.locator('.list-row').first()).toBeVisible({ timeout: 25000 });
    await page.locator('.list-row').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await expect(page).toHaveURL(/\/acceso/);
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await login(accounts[2]);
    await page.goto(base + '/liquidaciones');
    await expect(page.getByRole('button', { name: '↓ Exportar Excel' })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole('button', { name: '↓ Exportar Excel' }).click();
    await page.getByLabel('Todo el historial (ignorar filtros)').check();
    await page.getByRole('button', { name: /Preparar/ }).click();
    await expect(page.getByRole('button', { name: /Descargar/ })).toBeEnabled({ timeout: 30000 });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Descargar/ }).click();
    const downloaded = await download;
    assert.match(downloaded.suggestedFilename(), /\.xlsx$/);
    const workbook = await readFile(await downloaded.path(), 'utf8');
    assert.ok(
      (workbook.match(/<row /g) ?? []).length > 120,
      'Exportación contiene más de una página en ambas hojas',
    );
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.screenshot({ path: 'docs/evidence/browser-dashboard.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Liquidaciones', exact: true })).toBeVisible();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Sin desbordamiento horizontal en móvil',
    );
    await page.screenshot({ path: 'docs/evidence/browser-mobile.png', fullPage: true });
    assert.deepEqual(errors, [], 'Errores JavaScript de navegador');
    pass('Navegador: historial económico, cambio de identidad, panel de socias y descarga Excel');
  } catch (error) {
    await page.screenshot({ path: '.tools/browser-failure.png', fullPage: true });
    throw new Error('Navegador: ' + error.message);
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
