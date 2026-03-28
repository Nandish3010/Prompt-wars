'use client';

import { useState }        from 'react';
import IncidentForm        from '@/components/IncidentForm';
import RecentIncidents     from '@/components/RecentIncidents';

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      {/* Skip-to-content link (WCAG) */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header role="banner" className="site-header">
        <h1>CrisisConnect</h1>
        <p className="tagline">
          Turn chaos into actionable dispatch reports — powered by Gemini AI
        </p>
      </header>

      <main id="main-content">
        <section aria-labelledby="input-heading">
          <h2 id="input-heading">Describe the Incident</h2>
          <IncidentForm onDispatch={() => setRefreshKey(k => k + 1)} />
        </section>

        <RecentIncidents refreshKey={refreshKey} />
      </main>

      <footer>
        <p>
          Demo tool only — not for real emergency use. Always call 911.
          Powered by{' '}
          <a href="https://ai.google.dev" target="_blank" rel="noopener noreferrer">
            Google Gemini
          </a>{' '}
          and{' '}
          <a href="https://firebase.google.com" target="_blank" rel="noopener noreferrer">
            Firebase
          </a>.
        </p>
      </footer>
    </>
  );
}
