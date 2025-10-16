import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  History,
  RefreshCcw,
  Wallet,
} from 'lucide-react'
import BillingPage from '../Billing/BillingPage.jsx'

const dashboardSections = [
  { id: 'billing', label: 'Billing & payments', icon: Wallet, description: 'Manage invoices and receipts' },
  { id: 'schedule-upcoming', label: 'Upcoming pickups', icon: CalendarClock, description: 'Confirmed collection slots' },
  { id: 'schedule-history', label: 'Pickup history', icon: History, description: 'Completed and cancelled requests' },
]

const statusColorMap = {
  scheduled: 'success',
  cancelled: 'default',
  'pending-payment': 'warning',
  'payment-failed': 'error',
}

const paymentStatusColorMap = {
  success: 'success',
  pending: 'warning',
  failed: 'error',
  'not-required': 'default',
}

function titleCase(value = '') {
  return value
    .split(/\s|-/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function readJson(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch (error) {
    console.warn('Failed to parse response JSON', error)
    return {}
  }
}

function formatItemLabel(itemType, labelMap) {
  if (!itemType) return 'Special pickup'
  return labelMap[itemType] || titleCase(itemType)
}

function formatSlotWindow(slot) {
  if (!slot?.start) return 'Awaiting slot assignment'
  const start = new Date(slot.start)
  const end = slot.end ? new Date(slot.end) : null
  const datePart = start.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const timeOptions = { hour: '2-digit', minute: '2-digit' }
  const startTime = start.toLocaleTimeString('en-GB', timeOptions)
  const endTime = end ? end.toLocaleTimeString('en-GB', timeOptions) : null
  return endTime ? `${datePart} • ${startTime} – ${endTime}` : `${datePart} • ${startTime}`
}

function formatDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatStatusLabel(status) {
  if (!status) return 'Unknown'
  return titleCase(status.replace(/-/g, ' '))
}

function formatCurrency(amount, currency = 'LKR') {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return null
  try {
    return amount.toLocaleString('en-LK', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    })
  } catch (error) {
    console.warn('Failed to format amount', error)
    return `${currency} ${amount.toFixed(2)}`
  }
}

function useSchedulingData(session) {
  const [requests, setRequests] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const userId = session?.id || session?._id
    if (!userId) {
      setRequests([])
      setConfig(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [configResponse, requestsResponse] = await Promise.all([
        fetch('/api/schedules/special/config'),
        fetch(`/api/schedules/special/my?userId=${encodeURIComponent(userId)}`),
      ])

      const configPayload = await readJson(configResponse)
      if (!configResponse.ok || configPayload?.ok === false) {
        throw new Error(configPayload?.message || 'Unable to load scheduling configuration')
      }

      const requestsPayload = await readJson(requestsResponse)
      if (!requestsResponse.ok || requestsPayload?.ok === false) {
        throw new Error(requestsPayload?.message || 'Unable to load scheduling records')
      }

      setConfig(configPayload)
      setRequests(Array.isArray(requestsPayload.requests) ? requestsPayload.requests : [])
    } catch (err) {
      console.warn('Failed to load scheduling data', err)
      setError(err.message || 'Unable to fetch scheduling data')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [session?.id, session?._id])

  useEffect(() => {
    load()
  }, [load])

  const itemLabelMap = useMemo(() => {
    if (!config?.items) return {}
    return config.items.reduce((acc, item) => {
      acc[item.id] = item.label
      return acc
    }, {})
  }, [config])

  return {
    requests,
    itemLabelMap,
    loading,
    error,
    refresh: load,
  }
}

function DashboardSideNav({ collapsed, onToggle, activeSection, onNavigate }) {
  return (
    <aside className={`w-full lg:sticky lg:top-28 lg:w-auto ${collapsed ? 'lg:min-w-[5rem]' : 'lg:min-w-[16rem]'}`}>
      <div className={`glass-panel rounded-3xl border border-slate-200/70 bg-white/90 shadow-md transition-all duration-200 ${collapsed ? 'lg:px-2' : 'lg:px-4'} px-4 py-4`}>
        <div className="flex items-center justify-between">
          <Typography variant="subtitle2" fontWeight={600} className="lg:hidden">
            Sections
          </Typography>
          <IconButton
            onClick={onToggle}
            size="small"
            className="hidden lg:inline-flex"
            aria-label={collapsed ? 'Expand dashboard navigation' : 'Collapse dashboard navigation'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </IconButton>
        </div>
        <Stack
          direction={{ xs: 'row', lg: 'column' }}
          spacing={1}
          mt={collapsed ? 2 : 3}
          className="overflow-x-auto pb-1 lg:overflow-visible"
        >
          {dashboardSections.map(section => {
            const Icon = section.icon
            const isActive = activeSection === section.id
            return (
              <Tooltip
                key={section.id}
                title={section.label}
                placement="right"
                arrow
                disableHoverListener={!collapsed}
                disableFocusListener={!collapsed}
                disableTouchListener={!collapsed}
              >
                <span className="inline-flex">
                  <button
                    type="button"
                    onClick={() => onNavigate(section.id)}
                    className={`flex min-w-[3rem] items-center gap-3 rounded-2xl border border-transparent px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white lg:w-full ${collapsed ? 'lg:justify-center lg:px-2' : ''
                      } ${isActive
                        ? 'bg-brand-500/15 text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100/70'
                      }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className={`${collapsed ? 'lg:hidden' : ''} whitespace-nowrap`}>
                      {section.label}
                    </span>
                  </button>
                </span>
              </Tooltip>
            )
          })}
        </Stack>
      </div>
    </aside>
  )
}

function RequestCard({ request, itemLabelMap, variant = 'default' }) {
  const itemLabel = formatItemLabel(request.itemType, itemLabelMap)
  const slotLabel = formatSlotWindow(request.slot)
  const statusLabel = formatStatusLabel(request.status)
  const statusColor = statusColorMap[request.status] || 'default'
  const paymentStatus = request.paymentStatus || (request.paymentRequired ? 'pending' : 'not-required')
  const paymentLabel = formatStatusLabel(paymentStatus)
  const paymentColor = paymentStatusColorMap[paymentStatus] || 'default'
  const amountLabel = request.paymentAmount > 0
    ? formatCurrency(request.paymentAmount, request.currency || request.paymentCurrency || 'LKR')
    : null

  const cardClass = (() => {
    if (variant === 'upcoming') return 'border-brand-200/70 bg-emerald-50/40'
    if (variant === 'billing') return 'border-brand-200/60 bg-white'
    return 'border-slate-200/70 bg-white/95'
  })()

  return (
    <Box className={`rounded-2xl border px-4 py-3 transition ${cardClass}`}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
        <Stack spacing={0.75}>
          <Typography variant="subtitle1" fontWeight={600}>
            {itemLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quantity: {request.quantity}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Requested on {formatDate(request.createdAt)}
          </Typography>
        </Stack>
        <Stack spacing={1} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
          <Typography variant="body2" color="text.secondary">
            {slotLabel}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
            <Chip label={statusLabel} color={statusColor} size="small" variant={statusColor === 'success' ? 'filled' : 'outlined'} />
            <Chip label={paymentLabel} color={paymentColor} size="small" variant="outlined" />
            {amountLabel && (
              <Chip label={amountLabel} color="info" size="small" variant="outlined" />
            )}
          </Stack>
        </Stack>
      </Stack>
    </Box>
  )
}

function BillingSection({ session, requests, itemLabelMap, loading, error, onRefresh }) {
  const schedulePayments = useMemo(() => requests.filter(req => req.paymentAmount > 0), [requests])
  const outstandingPayments = useMemo(
    () => schedulePayments.filter(req => req.paymentStatus !== 'success'),
    [schedulePayments],
  )
  const settledPayments = useMemo(
    () => schedulePayments.filter(req => req.paymentStatus === 'success'),
    [schedulePayments],
  )

  const outstandingTotal = useMemo(
    () => outstandingPayments.reduce((sum, req) => sum + (req.paymentAmount || 0), 0),
    [outstandingPayments],
  )
  const settledTotal = useMemo(
    () => settledPayments.reduce((sum, req) => sum + (req.paymentAmount || 0), 0),
    [settledPayments],
  )

  const summaryItems = [
    {
      label: 'Outstanding schedule payments',
      value: outstandingTotal ? formatCurrency(outstandingTotal) : '—',
      helper: `${outstandingPayments.length} request${outstandingPayments.length === 1 ? '' : 's'}`,
      color: 'warning',
    },
    {
      label: 'Total paid via scheduling',
      value: settledTotal ? formatCurrency(settledTotal) : '—',
      helper: `${settledPayments.length} payment${settledPayments.length === 1 ? '' : 's'}`,
      color: 'success',
    },
  ]

  return (
    <section className="space-y-5">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Wallet className="h-5 w-5 text-brand-600" />
            <Typography variant="h6" fontWeight={600}>
              Billing & payments
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Track municipal invoices and payments tied to your special collection requests.
          </Typography>
        </Stack>
        <Tooltip title="Refresh scheduling data" placement="left">
          <span>
            <IconButton onClick={onRefresh} size="small" disabled={loading}>
              <RefreshCcw className="h-4 w-4" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Card className="glass-panel rounded-4xl border border-slate-200/70 bg-white/95 shadow-md">
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} justifyContent="space-between">
            {summaryItems.map(item => (
              <Box key={item.label} className="rounded-3xl border border-slate-200/60 bg-slate-50/70 px-5 py-4">
                <Typography variant="subtitle2" color="text.secondary">
                  {item.label}
                </Typography>
                <Typography variant="h5" fontWeight={600} mt={0.75}>
                  {item.value}
                </Typography>
                <Typography variant="caption" color={item.color === 'success' ? 'success.main' : 'warning.main'}>
                  {item.helper}
                </Typography>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={onRefresh}>
            Retry
          </Button>
        }>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={4}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={600}>
              Schedule payments awaiting collection
            </Typography>
            {outstandingPayments.length ? (
              <Stack spacing={2.5}>
                {outstandingPayments.map(request => {
                  const key = request._id || request.id
                  return <RequestCard key={key} request={request} itemLabelMap={itemLabelMap} variant="billing" />
                })}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No pending schedule payments right now. New requests that require payment will appear here.
              </Typography>
            )}
          </Stack>

          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={600}>
              Completed schedule payments
            </Typography>
            {settledPayments.length ? (
              <Stack spacing={2.5}>
                {settledPayments.map(request => {
                  const key = request._id || request.id
                  return <RequestCard key={key} request={request} itemLabelMap={itemLabelMap} variant="billing" />
                })}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No completed payments have been recorded yet.
              </Typography>
            )}
          </Stack>

          <Divider textAlign="left">Municipal invoices</Divider>

          <BillingPage session={session} variant="embedded" />
        </Stack>
      )}
    </section>
  )
}

function UpcomingSection({ upcoming, itemLabelMap, loading, error, onRefresh }) {
  return (
    <section className="space-y-5">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={2} alignItems="center">
            <CalendarClock className="h-5 w-5 text-brand-600" />
            <Typography variant="h6" fontWeight={600}>
              Upcoming pickups
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Confirmed special collections that are scheduled for future slots.
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Refresh scheduling data" placement="left">
            <span>
              <IconButton onClick={onRefresh} size="small" disabled={loading}>
                <RefreshCcw className="h-4 w-4" />
              </IconButton>
            </span>
          </Tooltip>
          <Button variant="contained" component={Link} to="/schedule">
            Schedule pickup
          </Button>
        </Stack>
      </Stack>

      <Card className="glass-panel rounded-4xl border border-slate-200/70 bg-white/95 shadow-md">
        <CardContent>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }} action={
              <Button color="inherit" size="small" onClick={onRefresh}>
                Retry
              </Button>
            }>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : upcoming.length ? (
            <Stack spacing={2.5}>
              {upcoming.map(request => {
                const key = request._id || request.id
                return <RequestCard key={key} request={request} itemLabelMap={itemLabelMap} variant="upcoming" />
              })}
            </Stack>
          ) : (
            <Box className="rounded-3xl border border-dashed border-slate-200/80 bg-slate-50/60 px-6 py-8 text-center">
              <Typography variant="subtitle1" fontWeight={600}>
                No upcoming pickups
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={1.5}>
                When you schedule a special collection, it will appear here with its assigned slot and payment status.
              </Typography>
              <Button variant="contained" component={Link} to="/schedule" sx={{ mt: 3 }}>
                Book a special pickup
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function HistorySection({ history, itemLabelMap, loading, onRefresh }) {
  return (
    <section className="space-y-5">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Stack direction="row" spacing={2} alignItems="center">
          <History className="h-5 w-5 text-brand-600" />
          <Typography variant="h6" fontWeight={600}>
            Pickup history
          </Typography>
        </Stack>
        <Tooltip title="Refresh scheduling data" placement="left">
          <span>
            <IconButton onClick={onRefresh} size="small" disabled={loading}>
              <RefreshCcw className="h-4 w-4" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Completed, cancelled, and payment-pending requests from your account.
      </Typography>

      <Card className="glass-panel rounded-4xl border border-slate-200/70 bg-white/95 shadow-md">
        <CardContent>
          {loading && history.length === 0 ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : history.length ? (
            <Stack spacing={2.5}>
              {history.map(request => {
                const key = request._id || request.id
                return <RequestCard key={key} request={request} itemLabelMap={itemLabelMap} />
              })}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No pickup history recorded yet. Schedule a collection to see it logged here for your records.
            </Typography>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

export default function UserDashboard({ session = null }) {
  const [navCollapsed, setNavCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 1024
  })
  const [activeSection, setActiveSection] = useState('billing')

  const { requests, itemLabelMap, loading, error, refresh } = useSchedulingData(session)

  const { upcoming, history } = useMemo(() => {
    const now = new Date()
    const upcomingRequests = []
    const historyRequests = []

    requests.forEach(request => {
      const slotStart = request.slot?.start ? new Date(request.slot.start) : null
      const isUpcoming = request.status === 'scheduled' && slotStart && slotStart >= now
      if (isUpcoming) {
        upcomingRequests.push(request)
      } else {
        historyRequests.push(request)
      }
    })

    upcomingRequests.sort((a, b) => new Date(a.slot.start) - new Date(b.slot.start))
    historyRequests.sort((a, b) => {
      const aTime = a.slot?.start ? new Date(a.slot.start).getTime() : new Date(a.createdAt).getTime()
      const bTime = b.slot?.start ? new Date(b.slot.start).getTime() : new Date(b.createdAt).getTime()
      return bTime - aTime
    })

    return { upcoming: upcomingRequests, history: historyRequests }
  }, [requests])

  const handleToggleNav = useCallback(() => {
    setNavCollapsed(prev => !prev)
  }, [])

  const handleNavigate = useCallback(sectionId => {
    setActiveSection(sectionId)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const sectionProps = {
    billing: {
      session,
      requests,
      itemLabelMap,
      loading,
      error,
      onRefresh: refresh,
    },
    'schedule-upcoming': {
      upcoming,
      itemLabelMap,
      loading,
      error,
      onRefresh: refresh,
    },
    'schedule-history': {
      history,
      itemLabelMap,
      loading,
      onRefresh: refresh,
    },
  }

  const ActiveSectionComponent = useMemo(() => {
    if (activeSection === 'schedule-upcoming') return UpcomingSection
    if (activeSection === 'schedule-history') return HistorySection
    return BillingSection
  }, [activeSection])

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 lg:flex-row">
      <DashboardSideNav
        collapsed={navCollapsed}
        onToggle={handleToggleNav}
        activeSection={activeSection}
        onNavigate={handleNavigate}
      />

      <div className="flex-1 space-y-8">
        <section>
          <div className="glass-panel rounded-4xl border border-slate-200/70 bg-white/90 p-8 shadow-md">
            <Stack spacing={1.5}>
              <Typography variant="overline" color="text.secondary" fontWeight={600}>
                Crew dashboard
              </Typography>
              <Typography variant="h4" fontWeight={600}>
                {session?.name ? `Welcome back, ${session.name}` : 'Welcome to your dashboard'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Use the sidebar to switch between billing, upcoming pickups, and your scheduling history.
              </Typography>
            </Stack>
          </div>
        </section>

        <ActiveSectionComponent {...sectionProps[activeSection]} />
      </div>
    </div>
  )
}
