import { Alert, Box, Button, Card, CardContent, CircularProgress, Grid, Stack, Typography } from '@mui/material'
import { CalendarClock, CheckCircle2, Clock3, Info } from 'lucide-react'
import { formatCurrency, formatSlotRange } from '../utils.js'

export function AvailabilitySection({ availability, loading, onConfirmSlot, bookingInFlight }) {
  const slots = availability?.slots ?? []
  const payment = availability?.payment
  const totalWeightKg = Number(payment?.totalWeightKg ?? 0)
  const weightChargeAmount = Number(payment?.weightCharge ?? 0)
  const taxAmount = Number(payment?.taxCharge ?? 0)

  if (!availability) {
    return null
  }

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <CalendarClock className="h-5 w-5 text-brand-600" />
            <Typography variant="h6" fontWeight={600}>
              Available slots
            </Typography>
          </Stack>

          {loading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : slots.length === 0 ? (
            <Alert severity="warning">
              No slots are available in the requested window. Please try a different time or date.
            </Alert>
          ) : (
            <Grid container spacing={3}>
              {slots.map(slot => (
                <Grid item xs={12} md={6} key={slot.slotId}>
                  <Card className="hover-lift rounded-3xl border border-slate-200/70 shadow-sm">
                    <CardContent>
                      <Stack spacing={2}>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Clock3 className="h-4 w-4 text-brand-600" />
                          <Typography variant="subtitle2" fontWeight={600}>
                            {formatSlotRange(slot)}
                          </Typography>
                        </div>
                        <Typography variant="body2" color="text.secondary">
                          Capacity remaining: {slot.capacityLeft}
                        </Typography>
                        {payment?.required ? (
                          <Alert severity="info" icon={<Info size={18} />}>
                            Payment required: {formatCurrency(payment.amount)}.
                            {totalWeightKg > 0 ? (
                              <>
                                {' '}
                                Estimated total weight: {totalWeightKg.toFixed(1)} kg.
                              </>
                            ) : null}
                            {weightChargeAmount > 0 ? (
                              <>
                                {' '}
                                Weight surcharge included: {formatCurrency(weightChargeAmount)}.
                              </>
                            ) : null}
                            {taxAmount > 0 ? (
                              <>
                                {' '}
                                Taxes applied: {formatCurrency(taxAmount)}.
                              </>
                            ) : null}
                            {' '}
                            Pay now to confirm immediately or choose to pay later from My Bills. Payment must be completed before the slot begins.
                          </Alert>
                        ) : (
                          <Alert severity="success" icon={<CheckCircle2 size={18} />}>
                            No payment required for this request.
                            {totalWeightKg > 0 ? (
                              <>
                                {' '}
                                Estimated total weight: {totalWeightKg.toFixed(1)} kg.
                              </>
                            ) : null}
                          </Alert>
                        )}
                        <Button
                          variant="contained"
                          onClick={() => onConfirmSlot(slot)}
                          disabled={bookingInFlight}
                        >
                          {bookingInFlight ? 'Processing…' : 'Confirm this slot'}
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
