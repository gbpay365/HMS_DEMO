import './styles/tailwind.css';
import { bootReactPage } from './lib/bootReactPage';

function startUi() {
  bootReactPage().catch((err) => console.error('[HMS UI] boot failed:', err));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startUi);
} else {
  startUi();
}
