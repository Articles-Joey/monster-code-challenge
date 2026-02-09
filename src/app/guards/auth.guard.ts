import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../services/auth.service';

/** Protects routes that require authentication (e.g. /details) */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const authenticated = await auth.checkSession();
  return authenticated ? true : router.createUrlTree(['/']);
};

/** Protects routes that should NOT be visited when already logged in (e.g. /) */
export const loginGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const authenticated = await auth.checkSession();
  return authenticated ? router.createUrlTree(['/details']) : true;
};
