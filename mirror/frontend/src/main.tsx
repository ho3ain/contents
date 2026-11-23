import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/vazirmatn';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalErrorReporting } from './lib/clientErrors';
import './index.css';
import './styles/marketing.css';
import './styles/discovery.css';
import './styles/home.css';
import './styles/creator-landing.css';
import './styles/website-surface.css';
import './styles/journey.css';
import './styles/mesh-cards.css';
import './styles/control.css';
import './styles/blog.css';
import './styles/share.css';
import './styles/blog-admin.css';
import './styles/creator-dashboard.css';
import './styles/account.css';
import './styles/earn.css';
import './styles/finance.css';
import './styles/trust.css';
import './styles/product-comparison.css';
import './styles/callout.css';
// Last: the shared table foundation normalises every table system in the app.
import './styles/table.css';

installGlobalErrorReporting();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
