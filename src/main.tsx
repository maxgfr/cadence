import './ui/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'

// Voice notes are gone: the database where an earlier version kept those recorded offline goes with them.
globalThis.indexedDB?.deleteDatabase('cadence-voice')

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
