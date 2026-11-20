import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/newsreader/opsz.css';
import '../ui/styles.css';
import './dashboard.css';
import App from './App.jsx';
import { ToastProvider } from '../ui/kit.jsx';

createRoot(document.getElementById('root')).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
