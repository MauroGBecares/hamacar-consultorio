import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Backend } from '@core/data-access/backend';
import { SessionService } from '@core/identity/session.service';
import { LocalFileStore } from '@core/files/local-file-store.service';
import { ClinicalRecordsService } from './clinical-records.service';
describe('Borradores temporales por identidad', () => {
  it('conserva texto y referencias persistidas; libera el texto al cambiar de identidad', () => {
    const user = signal({ id: 'author' });
    TestBed.configureTestingModule({
      providers: [
        { provide: Backend, useValue: {} },
        { provide: LocalFileStore, useValue: {} },
        { provide: SessionService, useValue: { user, requireUser: () => user() } },
      ],
    });
    const service = TestBed.inject(ClinicalRecordsService);
    service.remember('patient', 'private', {
      version: 2,
      date: '2026-10-09',
      text: 'Texto pendiente',
      files: [
        {
          id: 'local',
          name: 'x.pdf',
          url: 'blob:x',
          size: 1,
          type: 'application/pdf',
          lastModified: 0,
          persisted: false,
        },
      ],
    });
    expect(service.remembered('patient', 'private')?.text).toBe('Texto pendiente');
    expect(service.remembered('patient', 'private')?.files).toEqual([]);
    window.dispatchEvent(new Event('hamacar:identity-change'));
    expect(service.remembered('patient', 'private')).toBeUndefined();
  });
});
