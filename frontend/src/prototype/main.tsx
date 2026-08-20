import React from 'react';
import { createRoot } from 'react-dom/client';
import { Prototype } from './Prototype';
import './styles/tokens.css';
import './styles/prototype.css';

const el = document.getElementById('proto-root')!;
createRoot(el).render(<React.StrictMode><Prototype /></React.StrictMode>);
