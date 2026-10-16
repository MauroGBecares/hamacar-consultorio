import { inject, Injectable, signal } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { Observable } from 'rxjs';
import { PUBLIC_CONFIG } from '../config/public-config';
import { Database, Json } from './database.types';

export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
type Functions = Database['public']['Functions'];
export function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
export class RemoteError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function remoteError(error: { message: string; code?: string }): RemoteError {
  const safe = ['28000', '42501', 'PT409', '23505', '23P01', 'P0001'].includes(error.code ?? '');
  return new RemoteError(
    error.code ?? 'NETWORK',
    safe
      ? error.message
      : error.code?.startsWith('23')
        ? 'Revisá los datos: no cumplen las condiciones de la operación.'
        : 'No se pudo confirmar la operación. Conservá tus datos y reintentá.',
  );
}
/** Angular reads use this cancellable adapter through rxResource; commands stay explicit. */
export function remote<T>(
  request: (
    signal: AbortSignal,
  ) => PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>,
): Observable<T> {
  return new Observable((subscriber) => {
    const controller = new AbortController();
    Promise.resolve(request(controller.signal))
      .then(({ data, error }) => {
        if (subscriber.closed) return;
        if (error) subscriber.error(remoteError(error));
        else {
          subscriber.next(data as T);
          subscriber.complete();
        }
      })
      .catch((error) => {
        if (!subscriber.closed) subscriber.error(remoteError(error));
      });
    return () => controller.abort();
  });
}
@Injectable({ providedIn: 'root' })
export class Backend {
  private readonly pendingCommands = new Map<
    string,
    {
      name: 'patient_command' | 'clinical_command' | 'agenda_command' | 'finance_command';
      args: { p_action: string; p_input: Json; p_operation: string };
    }
  >();
  private readonly config = inject(PUBLIC_CONFIG);
  readonly client = createClient<Database>(
    this.config.supabaseUrl,
    this.config.supabasePublishableKey,
    {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    },
  );
  readonly revision = signal(0);
  constructor() {
    for (const event of ['focus', 'online']) window.addEventListener(event, () => this.refresh());
    window.addEventListener('hamacar:identity-change', () => this.pendingCommands.clear());
  }
  async command(
    name: 'patient_command' | 'clinical_command' | 'agenda_command' | 'finance_command',
    action: string,
    input: unknown,
    operation: string,
  ): Promise<Json> {
    const intent = this.pendingCommands.get(operation) ?? {
      name,
      args: { p_action: action, p_input: json(input), p_operation: operation },
    };
    if (intent.name !== name || intent.args.p_action !== action)
      throw new Error('Identificador de operación reutilizado.');
    this.pendingCommands.set(operation, intent);
    let result: Json;
    try {
      result = await this.call(intent.name, intent.args);
    } catch (error) {
      const code = error instanceof RemoteError ? error.code : 'NETWORK';
      console.warn('Operación no confirmada', { function: name, code, operation });
      if (!['NETWORK', ''].includes(code)) this.pendingCommands.delete(operation);
      throw new RemoteError(
        code,
        (error instanceof Error ? error.message : 'No se pudo confirmar la operación.') +
          ' Referencia: ' +
          operation,
      );
    }
    this.pendingCommands.delete(operation);
    return result;
  }
  refresh(): void {
    this.revision.update((value) => value + 1);
  }
  async call<N extends keyof Functions>(
    name: N,
    args: [Functions[N]['Args']] extends [never] ? Record<string, never> : Functions[N]['Args'],
  ): Promise<Functions[N]['Returns']> {
    const { data, error } = await this.client.rpc(name, args as Functions[N]['Args']);
    if (error) throw remoteError(error);
    return data as Functions[N]['Returns'];
  }
}
/** One key per unchanged intent. A retry of a lost response keeps the same key. */
export class Operation {
  private fingerprint = '';
  private id = '';
  key(payload: unknown): string {
    const fingerprint = JSON.stringify(payload);
    if (fingerprint !== this.fingerprint || !this.id) {
      this.fingerprint = fingerprint;
      this.id = crypto.randomUUID();
    }
    return this.id;
  }
  confirmed(): void {
    this.id = '';
    this.fingerprint = '';
  }
}
