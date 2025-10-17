import { useMemo } from 'react'
import { Alert, Box, Card, CardContent, Chip, CircularProgress, IconButton, Stack, Typography } from '@mui/material'
import { MailCheck, RefreshCcw } from 'lucide-react'
import { PAYMENT_STATUSES, REQUEST_STATUSES } from '../constants.js'
import { formatRequestTimestamp, formatSlotRange } from '../utils.js'

export function ScheduledRequests({ requests, loading, error, allowedItems, onRefresh }) {
  const decorated = useMemo(
    () => requests.map(request => {
      const totalWeight = Number(request.totalWeightKg)
      return {
        id: request._id || request.id,
        itemLabel: allowedItems.find(item => item.id === request.itemType)?.label || request.itemType,
        quantity: request.quantity,
        totalWeightKg: Number.isFinite(totalWeight) ? totalWeight : null,
        createdAt: request.createdAt,
        slot: request.slot,
        status: REQUEST_STATUSES[request.status] || REQUEST_STATUSES.scheduled,
        paymentStatus: PAYMENT_STATUSES[request.paymentStatus] || PAYMENT_STATUSES['not-required'],
      }
    }),
    [requests, allowedItems],
  )

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
      <CardContent>
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" spacing={2} justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={2}>
              <MailCheck className="h-5 w-5 text-brand-600" />
              <Typography variant="h6" fontWeight={600}>
                Your scheduled pickups
              </Typography>
            </Stack>
            <IconButton
              aria-label="Refresh scheduled pickups"
              onClick={onRefresh}
              disabled={loading}
              size="small"
            >
              <RefreshCcw className="h-4 w-4" />
            </IconButton>
          </Stack>
          {error ? (
            <Alert severity="error">{error}</Alert>
          ) : null}
          {loading && !decorated.length ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : decorated.length ? (
            <Stack spacing={2}>
              {decorated.map(request => (
                <Box
                  key={request.id}
                  className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-3"
                >
                  <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
                    <div>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {request.itemLabel}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Quantity: {request.quantity}
                      </Typography>
                      {request.totalWeightKg && request.totalWeightKg > 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Estimated total weight: {request.totalWeightKg.toFixed(1)} kg
                        </Typography>
                      ) : null}
                      <Typography variant="body2" color="text.secondary">
                        Requested on {formatRequestTimestamp(request.createdAt)}
                      </Typography>
                    </div>
                    <Stack spacing={1} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
                      <Typography variant="body2" color="text.secondary">
                        {formatSlotRange(request.slot)}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Chip
                          label={request.status.label}
                          color={request.status.color}
                          size="small"
                          variant={request.status.color === 'success' ? 'filled' : 'outlined'}
                        />
                        <Chip
                          label={request.paymentStatus.label}
                          color={request.paymentStatus.color}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              You have not scheduled any special pickups yet.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
