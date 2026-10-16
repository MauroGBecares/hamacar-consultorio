import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  await session.ready;
  return session.user()
    ? true
    : router.createUrlTree(['/acceso'], { queryParams: { returnUrl: state.url } });
};
