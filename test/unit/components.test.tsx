import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DashboardPage from '@/app/dashboard/page';
import Home from '@/app/page';
import IncidentForm from '@/components/IncidentForm';
import LocationMap from '@/components/LocationMap';
import VoiceInput from '@/components/VoiceInput';
import DispatchCard from '@/components/DispatchCard';
import RecentIncidents from '@/components/RecentIncidents';
import { Severity, LocationConfidence } from '@/shared/dispatch';

// Mock Firebase and Next.js router
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  onSnapshot: vi.fn((q, cb) => {
    cb({ docs: [] }); // simulate empty snapshot
    return vi.fn(); // unsubscribe mock
  }),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
}));

vi.mock('@/lib/firebase', () => ({
  firebaseApp: {},
}));

vi.mock('next/link', () => ({
  default: ({ children }: any) => <a>{children}</a>,
}));

// Mock MediaRecorder for JSDOM
if (typeof window !== 'undefined') {
  window.MediaRecorder = vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    ondataavailable: vi.fn(),
    onstop: vi.fn(),
  })) as any;
  (window.MediaRecorder as any).isTypeSupported = vi.fn().mockReturnValue(true);
}

describe('UI Components Smoke Tests', () => {
  it('renders Home page without crashing', () => {
    const { container } = render(<Home />);
    expect(container).toBeTruthy();
  });

  it('renders Dashboard Page without crashing', () => {
    const { container } = render(<DashboardPage />);
    expect(container).toBeTruthy();
  });

  it('interacts with Incident Form', () => {
    const { getByRole, getByLabelText } = render(<IncidentForm />);
    const textarea = getByLabelText(/Incident description/i) as HTMLTextAreaElement;
    
    // Simulate typing
    fireEvent.change(textarea, { target: { value: 'Test incident' } });
    expect(textarea.value).toBe('Test incident');

    // Simulate submit without file
    const submitBtn = getByRole('button', { name: /Analyze Incident/i });
    fireEvent.click(submitBtn);
  });

  it('renders Location Map', () => {
    const { container } = render(
      <LocationMap location="Bangalore" confidence={LocationConfidence.HIGH} coords={{lat: 12.9716, lng: 77.5946}} />
    );
    expect(container).toBeTruthy();
  });

  it('renders Voice Input', () => {
    const { container, getByRole } = render(<VoiceInput onTranscript={() => {}} disabled={false} />);
    expect(container).toBeTruthy();
    const btn = getByRole('button', { name: /voice input/i });
    fireEvent.click(btn);
  });

  it('renders Dispatch Card', () => {
    const { container } = render(
      <DispatchCard dispatch={{
        incidentType: 'Test',
        severity: Severity.HIGH,
        location: 'Bangalore',
        injuries: 'None',
        requiredResources: [],
        actionableSummary: 'Summary',
        locationConfidence: LocationConfidence.HIGH
      }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders Recent Incidents', () => {
    const { container } = render(<RecentIncidents refreshKey={0} />);
    expect(container).toBeTruthy();
  });
});

