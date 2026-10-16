import { computed, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { Session } from '@supabase/supabase-js';
import { Backend, remote, remoteError, Row } from '../data-access/backend';
import { User } from './user';
const asUser = (p: Row<'profiles'>): User => ({
  id: p.id,
  active: p.active,
  name: p.full_name.split(' ')[0],
  fullName: p.full_name,
  discipline: p.discipline,
  role: p.role as User['role'],
});
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly backend = inject(Backend);
  private readonly current = signal<User | null>(null);
  readonly user = this.current.asReadonly();
  readonly locked = signal(false);
  readonly busy = signal(false);
  readonly warning = signal(false);
  readonly sessionError = signal('');
  readonly isPartner = computed(() => this.user()?.role === 'partner');
  private sessionId = '';
  private lastIdentity = '';
  private lastActivity = 0;
  private pinging = false;
  private restoring: Promise<void> | null = null;
  private signingIn = false;
  readonly ready: Promise<void>;
  readonly usersResource = rxResource({
    params: () => ({ user: this.user()?.id, revision: this.backend.revision() }),
    defaultValue: [] as User[],
    stream: ({ params }) =>
      params.user
        ? remote((signal) =>
            this.backend.client.from('profiles').select('*').order('full_name').abortSignal(signal),
          ).pipe(map((rows) => rows.map(asUser)))
        : of([]),
  });
  readonly users = computed(() =>
    this.user() && this.usersResource.hasValue() ? this.usersResource.value() : [],
  );
  readonly activeUsers = computed(() => this.users().filter((u) => u.active));
  readonly billingUsers = computed(() => this.users().filter((u) => u.role === 'professional'));
  constructor() {
    this.ready = this.restore();
    this.backend.client.auth.onAuthStateChange((event, session) => {
      // Never await another auth operation inside the SDK callback's internal lock.
      if (event === 'SIGNED_OUT') this.block();
      else if (event === 'SIGNED_IN' && session && !this.signingIn)
        setTimeout(() => void this.restore(), 0);
    });
    for (const event of ['pointerdown', 'keydown', 'touchstart', 'wheel'])
      window.addEventListener(
        event,
        (e) => {
          if (e.isTrusted) this.humanActivity();
        },
        { passive: true },
      );
    window.addEventListener('storage', (event) => {
      if (event.key !== 'hamacar.activity' || !event.newValue) return;
      try {
        const v = JSON.parse(event.newValue) as { id: string; at: number };
        if (v.id === this.sessionId) this.lastActivity = Math.max(this.lastActivity, v.at);
      } catch {
        /* Ignore malformed timestamps. */
      }
      this.tick();
    });
    window.addEventListener('focus', () => {
      this.tick();
      if (this.user()) void this.check();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.tick();
        if (this.user()) void this.check();
      }
    });
    setInterval(() => this.tick(), 1000);
  }
  private getSessionId(session: Session): string {
    const value = JSON.parse(
      atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as { session_id: string };
    return value.session_id;
  }
  private restore(): Promise<void> {
    if (this.restoring) return this.restoring;
    this.restoring = (async () => {
      const { data, error } = await this.backend.client.auth.getSession();
      if (error || !data.session) {
        this.current.set(null);
        return;
      }
      try {
        const profile = await this.backend.call('session_open', {});
        if (this.lastIdentity && this.lastIdentity !== profile.id) {
          window.dispatchEvent(new Event('hamacar:identity-change'));
          location.assign('/inicio');
          return;
        }
        this.sessionId = this.getSessionId(data.session);
        const status = (await this.backend.call('session_status', {})) as { lastActivity: string };
        // Opening a tab reads the server timestamp without extending the session.
        this.lastActivity = Date.parse(status.lastActivity);
        this.shareActivity();
        this.current.set(asUser(profile));
        this.lastIdentity = profile.id;
        this.locked.set(false);
        this.sessionError.set('');
        this.tick();
      } catch (error) {
        this.sessionError.set(
          error instanceof Error ? error.message : 'No se pudo recuperar la sesión.',
        );
        this.block();
      }
    })().finally(() => {
      this.restoring = null;
    });
    return this.restoring;
  }
  async login(email: string, password: string): Promise<void> {
    const previous = this.lastIdentity;
    this.signingIn = true;
    const { data, error } = await this.backend.client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.session) {
      this.signingIn = false;
      throw new Error('Revisá el correo y la contraseña.');
    }
    try {
      const profile = await this.backend.call('session_open', {});
      this.sessionId = this.getSessionId(data.session);
      this.lastActivity = Date.now();
      this.shareActivity();
      if (previous && previous !== profile.id) {
        window.dispatchEvent(new Event('hamacar:identity-change'));
        location.assign('/inicio');
        return;
      }
      this.lastIdentity = profile.id;
      this.current.set(asUser(profile));
      this.locked.set(false);
      this.warning.set(false);
      this.sessionError.set('');
      this.backend.refresh();
    } catch (error) {
      await this.backend.client.auth.signOut({ scope: 'local' });
      throw error;
    } finally {
      this.signingIn = false;
    }
  }
  async logout(): Promise<void> {
    this.busy.set(true);
    this.block();
    try {
      await this.backend.call('session_close', {});
    } finally {
      await this.backend.client.auth.signOut({ scope: 'local' });
      this.lastIdentity = '';
      this.locked.set(false);
      this.busy.set(false);
      window.dispatchEvent(new Event('hamacar:identity-change'));
    }
  }
  async changePassword(password: string): Promise<void> {
    if (password.length < 12) throw new Error('Usá al menos 12 caracteres.');
    await this.backend.call('session_open', {});
    const { error } = await this.backend.client.auth.updateUser({ password });
    if (error) throw remoteError(error);
  }
  private async check(): Promise<void> {
    try {
      const profile = await this.backend.call('session_open', {});
      this.current.set(asUser(profile));
    } catch (error) {
      this.sessionError.set(error instanceof Error ? error.message : 'Revalidá tu sesión.');
      this.block();
    }
  }
  private humanActivity(): void {
    this.tick();
    if (!this.user() || this.pinging || Date.now() - this.lastActivity < 30000) return;
    this.pinging = true;
    void this.backend
      .call('session_activity', {})
      .then((at) => {
        this.lastActivity = Date.parse(at);
        this.shareActivity();
        this.warning.set(false);
      })
      .catch((error) => {
        if (error?.code === '28000') this.block();
      })
      .finally(() => {
        this.pinging = false;
      });
  }
  private shareActivity(): void {
    localStorage.setItem(
      'hamacar.activity',
      JSON.stringify({ id: this.sessionId, at: this.lastActivity }),
    );
  }
  private tick(): void {
    if (!this.user()) return;
    const idle = Date.now() - this.lastActivity;
    if (idle >= 30 * 60000) {
      this.block();
      void this.backend.call('session_close', {}).catch(() => {});
    } else this.warning.set(idle >= 28 * 60000);
  }
  private block(): void {
    if (this.current()) this.lastIdentity = this.current()!.id;
    this.current.set(null);
    this.locked.set(!!this.lastIdentity);
    this.warning.set(false);
    window.dispatchEvent(new Event('hamacar:lock'));
    this.backend.refresh();
  }
  requireUser(): User {
    const user = this.user();
    if (!user) throw new Error('Ingresá para continuar.');
    return user;
  }
  requirePartner(): User {
    const user = this.requireUser();
    if (user.role !== 'partner') throw new Error('Acción reservada a socias.');
    return user;
  }
  professional(id: string): User {
    const user = this.users().find((u) => u.id === id);
    if (!user) throw new Error('Profesional no disponible.');
    return user;
  }
}
