import { useEffect, useState } from 'react'
import { Link, NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { CssBaseline, Chip, Tooltip, ThemeProvider, createTheme, Button } from '@mui/material'
import { MapPinned, ClipboardCheck, Truck, CalendarClock, Receipt, BarChart3, Sparkles, Gauge, CheckCircle2, AlertTriangle, ArrowUpRight, LogIn, ShieldCheck, UserCircle } from 'lucide-react'
import './App.css'
import ManageCollectionOpsPage from './pages/ManageCollectionOps/ManageCollectionOpsPage.jsx'
import CollectorView from './pages/ManageCollectionOps/CollectorView.jsx'
import LoginPage from './pages/Auth/LoginPage.jsx'
import UserDashboard from './pages/Dashboards/UserDashboard.jsx'
import AdminDashboard from './pages/Dashboards/AdminDashboard.jsx'

const baseNavLinks = [
  { to: '/ops', label: 'Collection Ops', description: 'Plan and monitor routes', icon: MapPinned },
  { to: '/collector', label: 'Collector', description: 'Daily stop checklist', icon: ClipboardCheck },
  { to: '/schedule', label: 'Schedule', description: 'Pickup calendar', icon: CalendarClock },
  { to: '/billing', label: 'Billing', description: 'Payments & invoices', icon: Receipt },
  { to: '/analytics', label: 'Analytics', description: 'Performance dashboards', icon: BarChart3 },
]

function Nav({ session, onSignOut }) {
  const navLinks = [...baseNavLinks]
  if (session?.role === 'admin') {
    navLinks.push({
      to: '/adminDashboard',
      label: 'Admin Desk',
      description: 'Administration controls',
      icon: ShieldCheck,
    })
  } else if (session?.role === 'regular') {
    navLinks.push({
      to: '/userDashboard',
      label: 'Crew Desk',
      description: 'Your field assignments',
      icon: UserCircle,
    })
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/60 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4 text-slate-100">
        <div className="flex flex-1 min-w-[16rem] items-center gap-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/15 text-brand-200">SW</span>
            Smart Waste LK
          </Link>
          <Chip
            label="Pilot programme"
            size="small"
            color="success"
            variant="outlined"
            sx={{ borderRadius: '999px', fontWeight: 600, letterSpacing: '0.02em' }}
          />
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-4">
          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {navLinks.map(link => (
              <Tooltip key={link.to} title={link.description} placement="bottom" arrow enterDelay={150}>
                <NavLink
                  to={link.to}
                  className={({ isActive }) => `group relative flex items-center gap-2 rounded-full px-4 py-2 transition ${
                    isActive ? 'bg-brand-500/25 text-brand-100 shadow-inner' : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  {({ isActive }) => (
                    <>
                      <link.icon className="h-4 w-4" />
                      <span>{link.label}</span>
                      {isActive && <span className="h-2 w-2 rounded-full bg-brand-200" />}
                    </>
                  )}
                </NavLink>
              </Tooltip>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {session ? (
              <>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold text-slate-100">{session.name}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{session.role}</p>
                </div>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={onSignOut}
                  sx={{
                    borderRadius: '999px',
                    borderColor: 'rgba(148, 163, 184, 0.3)',
                    color: '#e2e8f0',
                    textTransform: 'none',
                    fontWeight: 600,
                    '&:hover': {
                      borderColor: 'rgba(148, 163, 184, 0.6)',
                      backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    },
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <NavLink
                to="/login"
                className="group inline-flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-slate-200 transition hover:border-brand-300 hover:text-brand-200"
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </NavLink>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function Home() {
  const highlights = [
    { label: 'Avg. Pickup Load', value: '2.6 t', helper: 'Across Colombo wards last 7 days', icon: Gauge },
    { label: 'Route Completion', value: '92%', helper: 'On-time stops today', icon: CheckCircle2 },
    { label: 'Alerts', value: '5 bins', helper: 'Approaching overflow threshold', icon: AlertTriangle },
  ]

  const quickLinks = [
    { to: '/ops', headline: 'Optimize ward routes', copy: 'Generate the most efficient path in seconds.', icon: MapPinned, accent: 'from-brand-400/30 via-brand-400/10 to-transparent' },
    { to: '/collector', headline: 'Coordinate field teams', copy: 'Live progress and digital checklists for crews.', icon: Truck, accent: 'from-sky-400/30 via-sky-400/10 to-transparent' },
    { to: '/analytics', headline: 'Spot hotspots early', copy: 'Use telemetry to prevent overflow incidents.', icon: BarChart3, accent: 'from-amber-400/30 via-amber-400/10 to-transparent' },
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-12">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="glass-panel rounded-4xl p-10 shadow-glow">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-600">
            <Sparkles className="h-3.5 w-3.5" />
            City operations cockpit
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">City-scale waste collection, simplified.</h1>
          <p className="mt-4 text-lg text-slate-600">Plan routes, guide crews, and monitor performance in one workspace tailored for Sri Lankan municipalities.</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/ops" className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/40 transition hover:translate-y-[-1px] hover:bg-brand-500">
              Start a new plan
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link to="/collector" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-300 hover:text-brand-700">
              View collector route
            </Link>
          </div>
        </div>
        <div className="glass-panel rounded-4xl border border-slate-200/60 bg-slate-950/95 p-8 text-slate-100 shadow-xl shadow-slate-900/40">
          <h2 className="text-sm uppercase tracking-wide text-slate-400">Ops snapshot</h2>
          <div className="mt-6 grid gap-6">
            {highlights.map(item => (
              <div key={item.label} className="flex items-start justify-between rounded-2xl bg-slate-900/60 px-5 py-4">
                <div className="flex items-start gap-3">
                  <item.icon className="mt-0.5 h-5 w-5 text-brand-300" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
                  </div>
                </div>
                <p className="max-w-[12rem] text-right text-xs text-slate-400">{item.helper}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-slate-400">Service window: 04:30 – 18:00 Colombo Time</p>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {quickLinks.map(card => (
          <Link key={card.to} to={card.to} className="group relative overflow-hidden rounded-4xl border border-slate-200/70 bg-white/80 p-6 shadow-md transition duration-200 hover:-translate-y-1 hover:shadow-xl">
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.accent}`} />
            <div className="relative flex h-full flex-col justify-between gap-6">
              <div className="flex items-center gap-3 text-slate-500">
                <card.icon className="h-5 w-5" />
                <p className="text-xs font-semibold uppercase tracking-wide">Go to module</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900">{card.headline}</h3>
                <p className="mt-3 text-sm text-slate-600">{card.copy}</p>
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 transition group-hover:text-brand-700">
                Open workspace
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  )
}

// Create a custom Material UI theme that integrates with our Tailwind colors
const theme = createTheme({
  palette: {
    primary: {
      main: '#10b981', // brand-500
      light: '#34d399', // brand-400
      dark: '#059669', // brand-600
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#475569', // slate-600
      light: '#64748b', // slate-500
      dark: '#334155', // slate-700
      contrastText: '#ffffff',
    },
    background: {
      default: '#f8fafc', // slate-50
      paper: '#ffffff',
    },
    text: {
      primary: '#0f172a', // slate-900
      secondary: '#475569', // slate-600
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    h1: {
      fontWeight: 600,
    },
    h2: {
      fontWeight: 600,
    },
    h3: {
      fontWeight: 600,
    },
    h4: {
      fontWeight: 500,
    },
    button: {
      fontWeight: 600,
      textTransform: 'none',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 9999, // Full rounded like Tailwind's rounded-full
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
  },
});

export default function App() {
  const [sessionUser, setSessionUser] = useState(() => {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem('sw-user')
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch (error) {
      console.warn('Failed to parse stored session', error)
      return null
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionUser) {
      window.localStorage.setItem('sw-user', JSON.stringify(sessionUser))
    } else {
      window.localStorage.removeItem('sw-user')
    }
  }, [sessionUser])

  const handleLoginSuccess = user => {
    setSessionUser(user)
  }

  const handleSignOut = () => {
    setSessionUser(null)
  }

  const currentYear = new Date().getFullYear()
  const reroutePath = sessionUser?.role === 'admin' ? '/adminDashboard' : '/userDashboard'

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="min-h-screen bg-brand-radial text-slate-900">
        <Nav session={sessionUser} onSignOut={handleSignOut} />
        <main className="pb-16 pt-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/ops" element={<ManageCollectionOpsPage />} />
            <Route path="/collector" element={<CollectorView />} />
            <Route path="/schedule" element={<div className="glass-panel mx-auto max-w-3xl rounded-3xl p-8 text-slate-600 shadow-md">Schedule module coming soon.</div>} />
            <Route path="/billing" element={<div className="glass-panel mx-auto max-w-3xl rounded-3xl p-8 text-slate-600 shadow-md">Billing features are being prepared.</div>} />
            <Route path="/analytics" element={<div className="glass-panel mx-auto max-w-3xl rounded-3xl p-8 text-slate-600 shadow-md">Analytics dashboards are in progress.</div>} />
            <Route
              path="/login"
              element={sessionUser ? <Navigate to={reroutePath} replace /> : <LoginPage onLogin={handleLoginSuccess} />}
            />
            <Route
              path="/userDashboard"
              element={sessionUser ? <UserDashboard /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/adminDashboard"
              element={sessionUser?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" replace />}
            />
          </Routes>
        </main>
        <footer className="border-t border-slate-200/80 bg-white/70 py-6 text-sm text-slate-500">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6">
            <p>© {currentYear} Smart Waste Sri Lanka Pilot</p>
            <div className="flex gap-4">
              <Link to="/ops" className="hover:text-slate-700">Operations Control</Link>
              <Link to="/collector" className="hover:text-slate-700">Field Crew</Link>
              <Link to="/analytics" className="hover:text-slate-700">Insights</Link>
            </div>
          </div>
        </footer>
      </div>
    </ThemeProvider>
  )
}
