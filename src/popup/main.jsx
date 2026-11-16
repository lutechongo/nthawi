import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import '../ui/styles.css';
import './popup.css';
import Popup from './Popup.jsx';

createRoot(document.getElementById('root')).render(<Popup />);
