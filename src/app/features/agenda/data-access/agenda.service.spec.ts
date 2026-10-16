import { AuditService } from '@core/data-access/audit.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Backend, RemoteError } from '@core/data-access/backend';
import { SessionService } from '@core/identity/session.service';
import { AgendaService } from './agenda.service';
import { AgendaEvent } from '../domain/booking';
describe('Comandos de agenda', () => {
  it('conserva la versión seleccionada y no refresca ni confirma ante un conflicto', async () => {
    const command = vi.fn().mockRejectedValue(new RemoteError('PT409', 'La reserva cambió.'));
    const refresh = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuditService, useValue: {} },
        { provide: Backend, useValue: { command, refresh, revision: signal(0) } },
        { provide: SessionService, useValue: { user: signal({ id: 'author' }) } },
      ],
    });
    const event = { id: 'series', original: '2026-10-15', version: 3 } as AgendaEvent;
    await expect(TestBed.inject(AgendaService).cancel(event, false, 'operation')).rejects.toThrow(
      'La reserva cambió',
    );
    expect(command.mock.calls[0][2]).toEqual({ id: 'series', original: '2026-10-15', version: 3 });
    expect(refresh).not.toHaveBeenCalled();
  });
});
