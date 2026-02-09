import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';

export interface FlightInfoPayload {
  airline: string;
  arrivalDate: string;
  arrivalTime: string;
  flightNumber: string;
  numOfGuests: number;
  comments?: string;
}

@Component({
  selector: 'app-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './details.html',
  styleUrl: './details.scss',
})
export class Details {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(AuthService);

  private readonly apiUrl = 'https://000000042.xyz/api/flight-info';

  protected readonly airlines = [
    'Alaska Airlines',
    'Allegiant Air',
    'American Airlines',
    'Breeze Airways',
    'Delta Air Lines',
    'Frontier Airlines',
    'Hawaiian Airlines',
    'JetBlue Airways',
    'Southwest Airlines',
    'Spirit Airlines',
    'Sun Country Airlines',
    'United Airlines',
    'Air Canada',
    'British Airways',
    'Emirates',
    'Lufthansa',
    'Qatar Airways',
    'Singapore Airlines',
    'Turkish Airlines',
    'WestJet',
  ];

  protected readonly flightForm = this.fb.nonNullable.group({
    airline: ['', Validators.required],
    arrivalDate: ['', Validators.required],
    arrivalTime: ['', Validators.required],
    flightNumber: ['', Validators.required],
    numOfGuests: [1, [Validators.required, Validators.min(1)]],
    comments: [''],
  });

  protected readonly isSubmitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async onSubmit(): Promise<void> {
    if (this.flightForm.invalid) {
      this.flightForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const payload: FlightInfoPayload = this.flightForm.getRawValue();
    const headers = new HttpHeaders({
      token: 'WW91IG11c3QgYmUgdGhlIGN1cmlvdXMgdHlwZS4gIEJyaW5nIHRoaXMgdXAgYXQgdGhlIGludGVydmlldyBmb3IgYm9udXMgcG9pbnRzICEh',
      candidate: 'Joey G',
    });

    try {
      await firstValueFrom(
        this.http.post(this.apiUrl, payload, { headers, observe: 'response' })
      );
      this.submitted.set(true);
    } catch {
      this.errorMessage.set('Submission failed. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async onLogout(): Promise<void> {
    await this.auth.logout();
  }
}
