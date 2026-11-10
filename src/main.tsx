import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { getValidatedEnv } from './utils/envValidation'

// Validate environment configuration at frontend initialization
getValidatedEnv()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
