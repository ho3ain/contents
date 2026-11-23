import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import ContentApp from './ContentApp';

// Base sheet first, then the content sheets — same order as MESH's src/main.tsx.
import './index.css';
import './styles/blog.css';
import './styles/blog-editorial.css';
import './styles/blog-admin.css';
import './styles/share.css';

/**
 * Entry point for the extracted content UI. Scaffolding — not MESH source.
 *
 * MESH's own `src/main.tsx` also imports ~15 further stylesheets for surfaces
 * that are not part of this extract (home, finance, trust, …) and installs a
 * global error reporter. Neither is reproduced here.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ContentApp />
    </BrowserRouter>
  </React.StrictMode>,
);
