import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import {backendConfigured} from "./backend/environment";
import { portalRole } from "./portal";
const Account = lazy(() => import('./Account'));
import DemoAccount from './DemoAccount';
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {!backendConfigured ? <p role="status">Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to run LocoRent. See CONFIGURATION.md.</p> : <>
    <Suspense fallback={<p role="status">Opening your account…</p>}>
      {new URLSearchParams(window.location.search).has('account') ? (new URLSearchParams(window.location.search).has('live') ? <Account portal={portalRole(window.location.pathname)} /> : <DemoAccount portal={portalRole(window.location.pathname)} />) : <App />}
    </Suspense>
    </>}
  </React.StrictMode>,
);
