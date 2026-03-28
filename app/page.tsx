import IncidentForm from '@/components/IncidentForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'CrisisConnect — Emergency Dispatch Assistant',
  description: 'Turn chaotic incident reports into structured dispatch data — powered by Google Gemini AI',
};

export default function Home() {
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
          <IncidentForm />
        </section>
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
