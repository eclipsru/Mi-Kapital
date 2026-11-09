import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/manrope';
import './styles.css';
import App from './App';
import { installAndroidBridge } from './core/android-bridge';
installAndroidBridge();
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
