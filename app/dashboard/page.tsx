'use client';

import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { getFirestore }        from 'firebase/firestore';
import { firebaseApp }         from '@/lib/firebase';
import { DispatchReport }      from '@/shared/dispatch';
import DispatchCard            from '@/components/DispatchCard';
import Link                    from 'next/link';

export default function DashboardPage() {
  const [incidents, setIncidents] = useState<DispatchReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    const db = getFirestore(firebaseApp);
    const q = query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(50));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => doc.data() as DispatchReport);
        setIncidents(data);
        setIsLoading(false);
      },
      (err) => {
        console.error('Firestore subscription error:', err);
        setError('Failed to connect to the live incident feed.');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>🚨 Active Incident Command Center</h1>
        <p>Real-time feed of parsed emergencies from field reporters.</p>
        <Link href="/" className="back-link">← Back to Reporter View</Link>
      </header>

      {error && <div className="error-message">{error}</div>}
      
      {isLoading ? (
        <div className="loading-state">
          <span className="spinner" aria-hidden="true" />
          <p>Connecting to live feed...</p>
        </div>
      ) : incidents.length === 0 ? (
        <div className="empty-state">
          <h2>No Active Incidents</h2>
          <p>The command center is quiet. New reports will appear here instantly.</p>
        </div>
      ) : (
        <div className="incidents-grid">
          {incidents.map((incident, i) => (
            <div key={incident.id || i} className="dashboard-card-wrapper">
              <DispatchCard dispatch={incident} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
