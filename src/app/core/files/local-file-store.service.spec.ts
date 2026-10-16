import { TestBed } from '@angular/core/testing';
import { LocalFileStore } from './local-file-store.service';

import { Backend } from '../data-access/backend';
import { SessionService } from '../identity/session.service';
import { signal } from '@angular/core';
describe('Archivos temporales', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        { provide: Backend, useValue: {} },
        { provide: SessionService, useValue: { user: signal({ id: 'author' }) } },
      ],
    }),
  );
  it('revoca URLs y libera referencias al retirar o destruir archivos', () => {
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:demo');
    const store = TestBed.inject(LocalFileStore);
    const first = store.add(
      new File(['contenido'], 'informe.pdf', { type: 'application/pdf' }),
      'clinical',
    );
    expect(store.file(first.id)?.name).toBe('informe.pdf');
    store.remove(first.id);
    expect(store.get(first.id)).toBeUndefined();
    store.add(new File(['contenido'], 'pago.png', { type: 'image/png' }), 'receipt');
    store.ngOnDestroy();
    expect(revoked).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
  it('rechaza archivos vacíos, ejecutables y Word como comprobante', () => {
    const store = TestBed.inject(LocalFileStore);
    expect(() =>
      store.add(new File([], 'vacio.pdf', { type: 'application/pdf' }), 'clinical'),
    ).toThrow();
    expect(() => store.add(new File(['x'], 'programa.exe'), 'clinical')).toThrow();
    expect(() => store.add(new File(['x'], 'documento.docx'), 'receipt')).toThrow();
  });
});
