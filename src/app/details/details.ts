import { ChangeDetectionStrategy, Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatIconModule } from '@angular/material/icon';

export interface FlightInfoPayload {
  airline: string;
  arrivalDate: string;
  arrivalTime: string;
  flightNumber: string;
  numOfGuests: number;
  comments?: string;
  submittedAt?: string;
}

@Component({
  selector: 'app-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, MatTimepickerModule, MatIconModule, DatePipe],
  templateUrl: './details.html',
  styleUrl: './details.scss',
})
export class Details implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly auth = inject(AuthService);

  private readonly apiUrl = '/api/flight-info';

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

  protected readonly today = new Date(new Date().setHours(0, 0, 0, 0));

  protected readonly flightForm = this.fb.nonNullable.group({
    airline: ['', Validators.required],
    arrivalDate: [new Date() as Date | null, Validators.required],
    arrivalTime: [null as Date | null, Validators.required],
    flightNumber: ['', Validators.required],
    numOfGuests: [1, [Validators.required, Validators.min(1), Validators.max(67)]],
    comments: [''],
  });

  protected readonly isSubmitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly existingFlightInfo = signal<FlightInfoPayload | null>(null);
  protected readonly isDeleting = signal(false);

  async ngOnInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      const res = await firstValueFrom(
        this.http.get<{ exists: boolean; data?: FlightInfoPayload }>(this.apiUrl),
      );
      if (res.exists && res.data) {
        // Firestore may return submittedAt as a Timestamp object
        const raw = res.data as any;
        if (raw.submittedAt && typeof raw.submittedAt === 'object' && raw.submittedAt._seconds) {
          raw.submittedAt = new Date(raw.submittedAt._seconds * 1000).toISOString();
        }
        this.existingFlightInfo.set(res.data);
      }
    } catch {
      // No existing data or error – show the form
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.flightForm.invalid) {
      this.flightForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const raw = this.flightForm.getRawValue();
    const d = raw.arrivalDate!;
    const t = raw.arrivalTime!;
    const payload: FlightInfoPayload = {
      ...raw,
      arrivalDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      arrivalTime: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
    };

    try {
      const response = await firstValueFrom(
        this.http.post(this.apiUrl, payload, { observe: 'response' })
      );
      console.log('Response status:', response.status);
      console.log('Response body:', response.body);
      this.existingFlightInfo.set(payload);
      this.submitted.set(true);
    } catch (err: any) {
      console.log('Error status:', err.status);
      console.log('Error body:', err.error);
      this.errorMessage.set('Submission failed. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async onRemoveFlightInfo(): Promise<void> {
    this.isDeleting.set(true);
    try {
      await firstValueFrom(this.http.delete(this.apiUrl));
      // Reset state so the form is shown again
      this.existingFlightInfo.set(null);
      this.submitted.set(false);
      this.flightForm.reset({
        airline: '',
        arrivalDate: new Date(),
        arrivalTime: null,
        flightNumber: '',
        numOfGuests: 1,
        comments: '',
      });
    } catch {
      this.errorMessage.set('Failed to remove flight info. Please try again.');
    } finally {
      this.isDeleting.set(false);
    }
  }

  async onLogout(): Promise<void> {
    await this.auth.logout();
  }
}
