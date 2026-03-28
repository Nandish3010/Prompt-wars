/**
 * Displays the 5 most recent dispatch reports pulled from Firestore.
 *
 * Re-fetches whenever `refreshKey` changes — incremented by IncidentForm
 * after each successful analysis so the panel stays current.
 *
 * Google service: Firebase Firestore (client-side reads via lib/firestore.ts)
 */
'use client';

import React, { useEffect, useState } from 'react';
import { DispatchReport, Severity } from '@/shared/dispatch';
import { getRecentDispatches }      from '@/lib/firestore';

interface RecentIncidentsProps {
  /** Increment to trigger a re-fetch after a new incident is submitted. */
  refreshKey: number;
}

const SEVERITY_COLOR: Record<Severity, string> = {
  [Severity.CRITICAL]: 'severity-critical',
  [Severity.HIGH]:     'severity-high',
  [Severity.MEDIUM]:   'severity-medium',
  [Severity.LOW]:      'severity-low',
};

/**
 * Recent incidents panel — reads the last 5 incidents from Firestore.
 * Shows nothing on first load if Firestore is empty.
 * @param refreshKey - increment to force a re-fetch
 */
export default function RecentIncidents({ refreshKey }: RecentIncidentsProps) {
  const [incidents, setIncidents] = useState<DispatchReport[]>([]);
  const [error,     setError]     = useState(false);

  useEffect(() => {
    setError(false);
    getRecentDispatches()
      .then(setIncidents)
      .catch(() => setError(true));
  }, [refreshKey]);

  if (!error && incidents.length === 0) return null;

  return (
    <section aria-label="Recent incidents" className="recent-incidents">
      <h2>Recent Incidents</h2>

      {error && (
        <p className="recent-error" role="alert">
          Could not load history.
        </p>
      )}

      {!error && (
        <ul className="recent-list">
          {incidents.map((inc, i) => (
            <li key={inc.id ?? i} className="recent-item">
              <span
                className={`severity-badge ${SEVERITY_COLOR[inc.severity]}`}
                aria-label={`Severity: ${inc.severity}`}
              >
                {inc.severity}
              </span>
              <span className="recent-type">{inc.incidentType}</span>
              {inc.location && (
                <span className="recent-location">— {inc.location}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
