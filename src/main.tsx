import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { LocaleProvider } from './i18n/LocaleProvider.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </ErrorBoundary>
);
