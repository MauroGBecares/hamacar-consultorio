import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '@core/identity/session.service';
import { errorMessage } from '@shared/utils/text';

@Component({
  selector: 'hm-login-page',
  imports: [FormsModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly showPassword = signal(false);
  readonly error = signal('');
  readonly pending = signal(false);
  name = '';
  password = '';
  async login(): Promise<void> {
    if (this.pending() || this.session.busy()) return;
    this.pending.set(true);
    this.error.set('');
    try {
      const reauth = this.session.locked();
      await this.session.login(this.name, this.password);
      this.password = '';
      if (reauth) return;
      const destination = this.route.snapshot.queryParamMap.get('returnUrl');
      void this.router.navigateByUrl(
        destination?.startsWith('/') &&
          !destination.startsWith('//') &&
          !destination.startsWith('/acceso')
          ? destination
          : '/inicio',
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
