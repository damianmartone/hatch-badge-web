import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ensureGeist } from './lib/fonts'
import './theme.css'

// Warm the font before any canvas measurement happens.
void ensureGeist()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
