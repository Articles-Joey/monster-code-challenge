import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

interface SessionResponse {
  authenticated: boolean;
  username: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly isAuthenticated = signal(false);
  readonly username = signal<string | null>(null);

  async checkSession(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    try {
      const res = await firstValueFrom(
        this.http.get<SessionResponse>('/api/check-session')
      );
      this.isAuthenticated.set(res.authenticated);
      this.username.set(res.username);
      return res.authenticated;
    } catch {
      this.isAuthenticated.set(false);
      this.username.set(null);
      return false;
    }
  }

  async login(
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.http.post<{ success: boolean }>('/api/login', { username, password })
      );
      this.isAuthenticated.set(true);
      this.username.set(username);
      return { success: true };
    } catch (err: unknown) {
      const message =
        (err as { error?: { error?: string } })?.error?.error || 'Login failed';
      return { success: false, error: message };
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/logout', {}));
    } finally {
      this.isAuthenticated.set(false);
      this.username.set(null);
      this.router.navigate(['/']);
    }
  }
}
