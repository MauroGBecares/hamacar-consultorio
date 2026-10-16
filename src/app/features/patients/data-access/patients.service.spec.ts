import { AuditService } from '@core/data-access/audit.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Backend } from '@core/data-access/backend';
import { SessionService } from '@core/identity/session.service';
import { Clock } from '@core/time/clock.service';
import { PatientsService } from './patients.service';
import { PatientData } from '../domain/patient';
describe('Persistencia de fichas', () => {
  it('no confirma cambios cuando el servidor rechaza y conserva el dato original del formulario', async () => {
    const command = vi.fn().mockRejectedValue(new Error('Sin conexión'));
    const refresh = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuditService, useValue: {} },
        { provide: Backend, useValue: { command, refresh, revision: signal(0) } },
        { provide: SessionService, useValue: { user: signal(null) } },
        { provide: Clock, useValue: { today: () => '2026-10-09' } },
      ],
    });
    const data: PatientData = {
      name: '  Paciente ficticio  ',
      birthDate: '2010-01-01',
      admission: '2020-01-01',
      school: '',
      insurance: '',
      cud: 'No informado',
      diagnosis: '',
      reason: '',
      family: '',
      relation: '',
      contact: '',
      referral: '',
      reentry: 'No',
    };
    await expect(
      TestBed.inject(PatientsService).save(data, undefined, false, 1, 'operation'),
    ).rejects.toThrow('Sin conexión');
    expect(data.name).toBe('  Paciente ficticio  ');
    expect(refresh).not.toHaveBeenCalled();
    expect(command.mock.calls[0][2].data.name).toBe('Paciente ficticio');
  });
});
