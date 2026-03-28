/**
 * Renders a DispatchReport as a structured emergency dispatch card.
 *
 * SECURITY: All Gemini-sourced values rendered via React JSX (escaped by default).
 * React prevents XSS automatically — never use dangerouslySetInnerHTML.
 *
 * Uses forwardRef so IncidentForm can move focus here for screen readers.
 */
'use client';

import React, { forwardRef } from 'react';
import { DispatchReport, Severity, LocationConfidence } from '@/shared/dispatch';
import LocationMap                                      from './LocationMap';

interface DispatchCardProps {
  dispatch: DispatchReport;
}

const SEVERITY_STYLES: Record<Severity, { bg: string; label: string }> = {
  [Severity.CRITICAL]: { bg: 'severity-critical', label: 'CRITICAL' },
  [Severity.HIGH]:     { bg: 'severity-high',     label: 'HIGH'     },
  [Severity.MEDIUM]:   { bg: 'severity-medium',   label: 'MEDIUM'   },
  [Severity.LOW]:      { bg: 'severity-low',       label: 'LOW'      },
};

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Renders the structured fields section of the dispatch card.
 * @param dispatch - validated DispatchReport
 */
function DispatchFields({ dispatch }: { dispatch: DispatchReport }) {
  return (
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

      {dispatch.weatherContext && (
        <div className="field-row">
          <dt>Weather</dt>
          <dd className="weather-context">{dispatch.weatherContext}</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * Renders the actionable summary section.
 * @param summary - 2-3 sentence summary from Gemini
 */
function ActionableSummary({ summary }: { summary: string }) {
  return (
    <section aria-label="Actionable summary" className="summary-section">
      <h3>Actionable Summary</h3>
      <p>{summary}</p>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Dispatch card component — renders a validated DispatchReport.
 * Forwarded ref allows IncidentForm to focus the card for screen reader announcement.
 * @param dispatch - fully validated DispatchReport from Gemini
 */
const DispatchCard = forwardRef<HTMLElement, DispatchCardProps>(
  function DispatchCard({ dispatch }, ref) {
    const severityStyle = SEVERITY_STYLES[dispatch.severity];

    return (
      <article
        ref={ref as React.Ref<HTMLElement>}
        className="dispatch-card"
        aria-label="Dispatch report"
        tabIndex={-1}
      >
        <header className="card-header">
          <h2>DISPATCH REPORT</h2>
          <span
            className={`severity-badge ${severityStyle.bg}`}
            aria-label={`Severity: ${severityStyle.label}`}
          >
            {severityStyle.label}
          </span>
        </header>

        <DispatchFields dispatch={dispatch} />

        {dispatch.location && (
          <LocationMap
            location={dispatch.location}
            confidence={dispatch.locationConfidence}
            coords={dispatch.coords}
          />
        )}

        <ActionableSummary summary={dispatch.actionableSummary} />
      </article>
    );
  },
);

DispatchCard.displayName = 'DispatchCard';

export default DispatchCard;
