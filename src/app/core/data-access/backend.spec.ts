import { TestBed } from '@angular/core/testing';
import { Backend, Operation, remote } from './backend';
import { PUBLIC_CONFIG } from '../config/public-config';
describe('Operaciones remotas', () => {
  it('reintenta exactamente la intención original si se pierde una respuesta', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PUBLIC_CONFIG,
          useValue: {
            supabaseUrl: 'https://test.supabase.co',
            supabasePublishableKey: 'sb_publishable_test',
          },
        },
      ],
    });
    const backend = TestBed.inject(Backend);
    const call = vi
      .spyOn(backend, 'call')
      .mockRejectedValueOnce(new Error('Sin respuesta'))
      .mockResolvedValue({ id: 'confirmed' });
    await expect(
      backend.command('finance_command', 'correct', { version: 2, amountCents: 100 }, 'operation'),
    ).rejects.toThrow();
    await backend.command(
      'finance_command',
      'correct',
      { version: 3, amountCents: 100 },
      'operation',
    );
    expect(call.mock.calls[1][1]).toEqual(call.mock.calls[0][1]);
    window.dispatchEvent(new Event('hamacar:identity-change'));
  });
  it('una nueva intención genera otra clave y un reintento conserva la anterior', () => {
    const op = new Operation(),
      a = op.key({ amount: 100 });
    expect(op.key({ amount: 100 })).toBe(a);
    expect(op.key({ amount: 101 })).not.toBe(a);
    op.confirmed();
    expect(op.key({ amount: 100 })).not.toBe(a);
  });
  it('cancela la consulta y descarta respuestas tardías al cambiar de recurso', async () => {
    let abort: AbortSignal | undefined;
    let finish!: (value: { data: number; error: null }) => void;
    const next = vi.fn();
    const subscription = remote<number>((signal) => {
      abort = signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    }).subscribe(next);
    subscription.unsubscribe();
    finish({ data: 1, error: null });
    await Promise.resolve();
    expect(abort?.aborted).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });
});
