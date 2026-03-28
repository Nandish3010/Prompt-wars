/**
 * Renders a DispatchReport as a structured emergency dispatch card.
 *
 * SECURITY: All Gemini-sourced values rendered via React's JSX (escaped by default).
 * React prevents XSS automatically when using {variable} syntax — never dangerouslySetInnerHTML.
 *
 * Includes Google Maps embed for extracted location (LocationMap component).
 */
'use client';

import { DispatchReport, Severity, LocationConfidence } from '@/shared/dispatch';
import LocationMap from './LocationMap';

interface DispatchCardProps {
  dispatch: DispatchReport;
}

const SEVERITY_STYLES: Record<Severity, { bg: string; label: string }> = {
  [Severity.CRITICAL]: { bg: 'severity-critical', label: 'CRITICAL' },
  [Severity.HIGH]:     { bg: 'severity-high',     label: 'HIGH'     },
  [Severity.MEDIUM]:   { bg: 'severity-medium',   label: 'MEDIUM'   },
  [Severity.LOW]:      { bg: 'severity-low',       label: 'LOW'      },
};

/**
 * Dispatch card component — renders a validated DispatchReport.
 * @param dispatch - fully validated DispatchReport from Gemini
 */
export default function DispatchCard({ dispatch }: DispatchCardProps) {
  const severityStyle = SEVERITY_STYLES[dispatch.severity];

  return (
    <article className="dispatch-card" aria-label="Dispatch report" tabIndex={-1}>
      <header className="card-header">
        <h2>DISPATCH REPORT</h2>
        <span
          className={`severity-badge ${severityStyle.bg}`}
          aria-label={`Severity: ${severityStyle.label}`}
        >
          {severityStyle.label}
        </span>
      </header>

      <dl className="dispatch-fields">
        <div className="field-row">
          <dt>Incident Type</dt>
          <dd>{dispatch.incidentType}</dd>
        </div>

        <div className="field-row">
          <dt>Location</dt>
          <dd>
            {dispatch.location ?? 'Unknown'}
            {dispatch.locationConfidence === LocationConfidence.LOW && (
              <span
                className="confidence-badge confidence-low"
                aria-label="Location confidence: Low"
              >
                Low confidence
              </span>
            )}
          </dd>
        </div>

        <div className="field-row">
          <dt>Injuries</dt>
          <dd>{dispatch.injuries}</dd>
        </div>

        <div className="field-row">
          <dt>Required Resources</dt>
          <dd>
            {dispatch.requiredResources.length === 0 ? (
              'None identified'
            ) : (
              <ul className="resource-list">
                {dispatch.requiredResources.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>

      {/* Google Maps embed — shown when location is high/medium confidence */}
      {dispatch.location && (
        <LocationMap
          location={dispatch.location}
          confidence={dispatch.locationConfidence}
        />
      )}

      <section aria-label="Actionable summary" className="summary-section">
        <h3>Actionable Summary</h3>
        <p>{dispatch.actionableSummary}</p>
      </section>
    </article>
  );
}
