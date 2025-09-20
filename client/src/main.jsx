import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/index.css'
import Landing from './pages/Landing'
import Wall from './pages/Wall'
import Admin from './pages/Admin'
import PasscodeGate from './pages/PasscodeGate'

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/wall', element: <Wall /> },
  { path: '/passcode', element: <PasscodeGate /> },
  { path: '/admin', element: <Admin /> },
])

const qc = new QueryClient()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
)