import { Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material'
import { CalendarClock, ClipboardCheck, MapPinned } from 'lucide-react'
import BillingPage from '../Billing/BillingPage.jsx'

const quickStats = [
  {
    title: 'Today\'s pickups',
    value: '14 stops',
    helper: 'Covering wards CMC-W05, CMC-W06',
    icon: ClipboardCheck,
  },
  {
    title: 'Next scheduled route',
    value: '05:30',
    helper: 'Depot departure in 45 minutes',
    icon: CalendarClock,
  },
  {
    title: 'Active route',
    value: 'Route A3',
    helper: 'Optimized path via Baseline Rd.',
    icon: MapPinned,
  },
]

export default function UserDashboard({ session = null }) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={3}>
        <div>
          <Typography variant="h4" fontWeight={600} color="text.primary">
            Field crew dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Track your assigned pickups and stay aligned with the municipal operations team.
          </Typography>
        </div>
        <Chip label="Regular user" color="primary" variant="outlined" sx={{ fontWeight: 600 }} />
      </Stack>

      <Grid container spacing={3}>
        {quickStats.map(stat => (
          <Grid item xs={12} md={4} key={stat.title}>
            <Card className="glass-panel rounded-3xl shadow-md">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-3 text-brand-600">
                  <stat.icon className="h-5 w-5" />
                  <Typography variant="overline" color="text.secondary" fontWeight={600}>
                    {stat.title}
                  </Typography>
                </div>
                <Typography variant="h5" fontWeight={600} color="text.primary">
                  {stat.value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {stat.helper}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <div className="glass-panel rounded-4xl border border-slate-200/60 bg-white/90 p-8 shadow-md">
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Checklist guidance
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Review the assigned route, confirm vehicle inspection, and update bin status after each pickup. Upcoming updates will surface live notifications from the operations control room.
        </Typography>
      </div>

      <BillingPage session={session} variant="embedded" />
    </div>
  )
}
