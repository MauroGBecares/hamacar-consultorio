import { USERS, testUserId } from '@core/identity/users.mock';
import { seedSettlements } from '../data-access/settlements.mock';
import { ExportFilters, exportPayments, exportSheets, selectTransfers } from './payment-export';

const filters = (patch: Partial<ExportFilters> = {}): ExportFilters => ({
  all: false,
  professionalId: '',
  month: '',
  from: '',
  to: '',
  state: '',
  ...patch,
});
const readBlob = (blob: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
describe('Exportación de pagos', () => {
  it('combina profesional, ciclo, fechas inclusivas y estado', () => {
    const selected = selectTransfers(
      seedSettlements(),
      filters({
        professionalId: testUserId(9),
        month: '2026-09',
        from: '2026-09-22',
        to: '2026-09-22',
        state: 'informed',
      }),
    );
    expect(selected).toHaveLength(1);
  });
  it('rechaza rangos invertidos pero todo historial ignora los filtros', () => {
    const state = seedSettlements();
    expect(() =>
      selectTransfers(state, filters({ from: '2026-09-25', to: '2026-09-01' })),
    ).toThrow();
    expect(
      selectTransfers(state, filters({ all: true, from: '2026-09-25', to: '2026-09-01' })),
    ).toHaveLength(state.transfers.length);
  });
  it('incluye reemplazados y no duplica conceptos de una liquidación con varios pagos', () => {
    const state = seedSettlements();
    const payment = state.transfers[0];
    state.transfers.push({ ...payment, id: 'another-payment', state: 'replaced' });
    const sheets = exportSheets(state, USERS, filters());
    expect(sheets[0].rows).toHaveLength(state.transfers.length);
    const ids = sheets[1].rows.map((row) => row[1].value);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sheets[0].rows.some((row) => row[6].value === 'Reemplazado')).toBe(true);
  });
  it('produce un paquete OOXML, con fechas y moneda numéricas, sin datos clínicos', async () => {
    const sheets = exportSheets(seedSettlements(), USERS, filters());
    expect(sheets[0].rows[0][4].style).toBe(3);
    expect(sheets[0].rows[0][5].style).toBe(2);
    expect(typeof sheets[0].rows[0][5].value).toBe('number');
    const blob = exportPayments(seedSettlements(), USERS, filters());
    const bytes = await readBlob(blob);
    expect(new DataView(bytes).getUint32(0, true)).toBe(0x04034b50);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('Detalle por paciente');
    expect(text).not.toContain('blob:');
    expect(text).not.toContain('diagnosis');
  });
  it('exporta entradas que empiezan con = como texto y escapa XML', async () => {
    const state = seedSettlements();
    state.transfers[0].notes = [
      { text: '=HYPERLINK("https://example.test") & <test>', author: 'Demo', at: '' },
    ];
    const text = new TextDecoder().decode(await readBlob(exportPayments(state, USERS, filters())));
    expect(text).toContain('=HYPERLINK(&quot;https://example.test&quot;) &amp; &lt;test&gt;');
    expect(text).not.toContain('<f>');
  });
  it('no descarga sin resultados', () =>
    expect(() =>
      exportPayments(seedSettlements(), USERS, filters({ month: '2000-01' })),
    ).toThrow());
});
