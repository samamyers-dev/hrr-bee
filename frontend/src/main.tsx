import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/main.css';

// Hydrate theme class before first paint to avoid flash.
function hydrateTheme() {
  try {
    const saved = localStorage.getItem('hrr-bee-theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
      return;
    }
  } catch {}
  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}
hydrateTheme();

createRoot(document.getElementById('root')!).render(<App />);
