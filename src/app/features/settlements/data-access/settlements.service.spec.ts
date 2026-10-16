import { AuditService } from '@core/data-access/audit.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Backend } from '@core/data-access/backend';
import { SessionService } from '@core/identity/session.service';
import { Clock } from '@core/time/clock.service';
import { LocalFileStore } from '@core/files/local-file-store.service';
import { SettlementsService } from './settlements.service';
describe('Exportación remota completa', () => {
  it('recorre páginas manteniendo la revisión y rechaza la mezcla de revisiones', async () => {
    let calls = 0;
    const seen: unknown[] = [];
    const rpc = vi.fn((_name: string, args: { p_query?: { revision?: number } }) => {
      seen.push(args);
      calls++;
      const response =
        calls === 1
          ? { data: { items: [], revision: 7, nextCursor: 'next' }, error: null }
          : { data: null, error: { code: 'PT409', message: 'Los datos cambiaron' } };
      return { abortSignal: () => Promise.resolve(response) };
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuditService, useValue: {} },
        { provide: Backend, useValue: { client: { rpc }, revision: signal(0) } },
        {
          provide: SessionService,
          useValue: {
            locked: () => false,
            user: signal({ id: 'partner' }),
            users: signal([]),
            requirePartner: () => ({ id: 'partner' }),
          },
        },
        { provide: Clock, useValue: { today: () => '2026-10-09' } },
        { provide: LocalFileStore, useValue: {} },
      ],
    });
    const service = TestBed.inject(SettlementsService);
    const resource = TestBed.runInInjectionContext(() =>
      service.exportResource(signal({ month: '2026-10-01' })),
    );
    // Keep the page's workspace inactive; this assertion targets the explicit export.
    service.workspaceResource.destroy();
    TestBed.tick();
    await vi.waitFor(() => expect(resource.error()?.message).toContain('Los datos cambiaron'));
    expect(seen[1]).toMatchObject({ p_query: { revision: 7, cursor: 'next' } });
    expect(resource.hasValue()).toBe(false);
  });
});
