import { signal } from '@angular/core';
import { PatientsService } from '@features/patients/public-api';
import { AgendaService } from '../data-access/agenda.service';
import { Clock } from '@core/time/clock.service';
import { TestBed } from '@angular/core/testing';
import { SessionService } from '@core/identity/session.service';
import { BookingEditor } from './booking-editor';

describe('Editor de reservas zoneless', () => {
  // JSDOM no implementa el diálogo nativo. Su foco/teclado se verifica en navegador.
  const originals = ['showModal', 'close'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key)] as const,
  );
  beforeAll(() => {
    for (const [key] of originals)
      Object.defineProperty(HTMLDialogElement.prototype, key, {
        configurable: true,
        value: vi.fn(),
      });
  });
  afterAll(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
    }
  });
  it('conserva fecha, horario y consultorio al cambiar la profesional', async () => {
    const user = { id: 'partner', fullName: 'Socia ficticia' };
    TestBed.configureTestingModule({
      imports: [BookingEditor],
      providers: [
        {
          provide: SessionService,
          useValue: {
            user: signal(user),
            requireUser: () => user,
            activeUsers: signal([user]),
            isPartner: () => true,
          },
        },
        {
          provide: PatientsService,
          useValue: {
            directoryResource: () => ({
              hasValue: () => true,
              value: () => [{ id: 'patient', name: 'Paciente ficticio', status: 'Activo' }],
              isLoading: () => false,
              error: () => undefined,
            }),
          },
        },
        { provide: Clock, useValue: { today: () => '2026-09-25' } },
        { provide: AgendaService, useValue: { save: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(BookingEditor);
    fixture.componentRef.setInput('date', '2026-09-25');
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.form.start = '2026-10-01';
    component.form.room = 3;
    component.form.from = '11:00';
    component.selectProfessional('professional');
    await fixture.whenStable();
    expect(component.form.start).toBe('2026-10-01');
    expect(component.form.room).toBe(3);
    expect(component.form.from).toBe('11:00');
    expect(component.form.patientId).toBe('');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Paciente ficticio');
  });
});
