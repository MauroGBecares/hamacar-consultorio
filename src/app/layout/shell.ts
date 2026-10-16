import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '@core/identity/session.service';
import { Clock } from '@core/time/clock.service';
import { PatientsService } from '@features/patients/public-api';
import { Dialog } from '@shared/ui/dialog';
import { ResourceFeedback } from '@shared/ui/resource-feedback';
import { LoginPage } from '@features/auth/pages/login-page';
import { initials, normalize, errorMessage } from '@shared/utils/text';
import { formatDate } from '@shared/utils/date';

@Component({
  selector: 'hm-shell',
  imports: [
    FormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    Dialog,
    LoginPage,
    ResourceFeedback,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly patients = inject(PatientsService);
  private readonly clock = inject(Clock);
  readonly currentDate = computed(() => formatDate(this.clock.today()));
  readonly searchOpen = signal(false);
  readonly query = signal('');
  readonly searchResource = this.patients.directoryResource(
    computed(() => ({ search: this.query() })),
  );
  readonly results = computed(() =>
    this.searchResource.hasValue() ? this.searchResource.value() : [],
  );
  readonly passwordDialog = signal(false);
  readonly passwordPending = signal(false);
  readonly passwordError = signal('');
  password = '';
  passwordRepeat = '';
  async changePassword(): Promise<void> {
    if (this.passwordPending()) return;
    this.passwordPending.set(true);
    this.passwordError.set('');
    try {
      if (this.password !== this.passwordRepeat) throw new Error('Las contraseñas no coinciden.');
      await this.session.changePassword(this.password);
      this.password = '';
      this.passwordRepeat = '';
      this.passwordDialog.set(false);
    } catch (error) {
      this.passwordError.set(errorMessage(error));
    } finally {
      this.passwordPending.set(false);
    }
  }
  readonly initials = initials;
  readonly navigation = [
    { path: '/inicio', name: 'Inicio', icon: '⌂' },
    { path: '/pacientes', name: 'Pacientes', icon: '♧' },
    { path: '/agenda', name: 'Agenda', icon: '▦' },
    { path: '/liquidaciones', name: 'Liquidaciones', icon: '≡' },
  ];
  @HostListener('document:keydown', ['$event']) shortcut(event: KeyboardEvent): void {
    if (
      !this.session.locked() &&
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'k' &&
      !document.querySelector('dialog[open]')
    ) {
      event.preventDefault();
      this.searchOpen.set(true);
    }
  }
  skip(event: Event): void {
    event.preventDefault();
    document.getElementById('main')?.focus();
  }
  async logout(): Promise<void> {
    try {
      await this.session.logout();
    } finally {
      void this.router.navigate(['/acceso']);
    }
  }
}
