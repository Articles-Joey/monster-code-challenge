import { Routes } from '@angular/router';
import { authGuard, loginGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [loginGuard],
    loadComponent: () => import('./login/login').then((m) => m.Login),
  },
  {
    path: 'details',
    canActivate: [authGuard],
    loadComponent: () => import('./details/details').then((m) => m.Details),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
