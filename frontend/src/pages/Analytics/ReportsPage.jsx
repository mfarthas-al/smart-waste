/**
 * Reports Page Component
 * 
 * Main page for analytics and waste reports.
 * Refactored following SOLID principles and design patterns:
 * - Single Responsibility: Each component has one clear purpose
 * - Open/Closed: Extended through composition, not modification
 * - Dependency Inversion: Depends on abstractions (hooks, services)
 * - Custom Hook Pattern: Encapsulates stateful logic
 * - Component Composition: Built from smaller, reusable components
 * 
 * @component
 */

import { useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { BarChart3, LineChart, PieChart } from 'lucide-react';

// Custom hooks
import { useAnalyticsReport } from './hooks/useAnalyticsReport';

// Components
import ReportFilters from './components/ReportFilters';
import ReportSummary from './components/ReportSummary';
import HorizontalMetricBar from './components/HorizontalMetricBar';
import TimelineSparkline from './components/TimelineSparkline';

// Utilities
import { exportReport } from './utils/exportUtils';
import { formatKg } from './utils/formatUtils';

/**
 * ReportsPage Component
 * 
 * @param {Object} props
 * @param {Object} props.session - User session object containing user ID
 */
export default function ReportsPage({ session }) {
  // Extract user ID from session
  const userId = session?.id || session?._id;

  // Use custom hook for report management
  const {
    config,
    loadingConfig,
    filters,
    updateFilter,
    visibility,
    toggleVisibility,
    report,
    loadingReport,
    generateReport,
    error,
    noRecordsMessage,
    setError,
    setNoRecordsMessage,
  } = useAnalyticsReport(userId);

  /**
   * Handles export actions
   * Delegates to export utility
   */
  const handleExport = useCallback(
    (format) => {
      try {
        exportReport(format, report);
      } catch (err) {
        setError(err.message);
      }
    },
    [report, setError]
  );

  /**
   * Calculates maximum value for region chart
   * Memoized to avoid recalculation on every render
   */
  const maxRegionValue = useMemo(() => {
    if (!report?.charts?.regionSummary?.length) return 0;
    return Math.max(...report.charts.regionSummary.map((item) => item.totalKg));
  }, [report]);

  /**
   * Calculates maximum value for waste type chart
   * Memoized to avoid recalculation on every render
   */
  const maxWasteValue = useMemo(() => {
    if (!report?.charts?.wasteSummary?.length) return 0;
    return Math.max(...report.charts.wasteSummary.map((item) => item.totalKg));
  }, [report]);

  return (
    <div className="glass-panel mx-auto mt-4 max-w-6xl rounded-4xl border border-slate-200/70 bg-white/90 p-8 shadow-xl">
      <Stack spacing={5}>
        {/* Page header */}
        <Box>
          <Chip
            icon={<BarChart3 size={16} />}
            label="Reports & analytics"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600, borderRadius: '999px' }}
          />
          <Typography variant="h4" fontWeight={600} mt={2} color="text.primary">
            Generate waste insights by region, customer, and billing model
          </Typography>
          <Typography variant="body1" color="text.secondary" mt={1.5}>
            Choose your filters to uncover how waste generation is trending across the network.
            Results update with each run and can be exported for sharing.
          </Typography>
        </Box>

        {/* Error alert */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* No records alert */}
        {noRecordsMessage && (
          <Alert severity="info" onClose={() => setNoRecordsMessage('')}>
            {noRecordsMessage}
          </Alert>
        )}

        {/* Filter form */}
        <ReportFilters
          config={config}
          filters={filters}
          onFilterChange={updateFilter}
          visibility={visibility}
          onVisibilityToggle={toggleVisibility}
          onSubmit={generateReport}
          loading={loadingReport}
          loadingConfig={loadingConfig}
        />

        {/* Report summary */}
        {report && <ReportSummary report={report} onExport={handleExport} />}

        {/* Report sections */}
        {report && (
          <Stack spacing={4}>
            {/* Region analysis */}
            {visibility.regions && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<PieChart className="h-5 w-5 text-brand-600" />}
                  title="Region-wise waste analysis"
                  subheader="Compare waste volumes across the selected regions"
                />
                <CardContent>
                  <Stack spacing={2}>
                    {(report.charts.regionSummary || []).map((region) => (
                      <HorizontalMetricBar
                        key={region.region}
                        label={region.region}
                        value={region.totalKg}
                        maxValue={maxRegionValue}
                        accent="linear-gradient(90deg, rgba(16,185,129,0.65) 0%, rgba(14,165,233,0.5) 100%)"
                      />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            )}

            {/* Waste type composition */}
            {visibility.wasteTypes && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<PieChart className="h-5 w-5 text-amber-500" />}
                  title="Recyclable vs non-recyclable"
                  subheader="Waste composition across the chosen filters"
                />
                <CardContent>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <Stack spacing={2}>
                        {(report.charts.wasteSummary || []).map((item) => (
                          <HorizontalMetricBar
                            key={item.wasteType}
                            label={item.wasteType}
                            value={item.totalKg}
                            maxValue={maxWasteValue}
                            accent="linear-gradient(90deg, rgba(244,114,182,0.65) 0%, rgba(251,191,36,0.55) 100%)"
                          />
                        ))}
                      </Stack>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Box className="rounded-3xl border border-slate-100 bg-slate-50/60 p-6">
                        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                          Split snapshot
                        </Typography>
                        <Stack spacing={2}>
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Box
                              sx={{
                                width: 16,
                                height: 16,
                                borderRadius: '999px',
                                bgcolor: 'rgba(16, 185, 129, 0.7)',
                              }}
                            />
                            <Typography variant="body2">
                              Recyclable {formatKg(report.totals.recyclableWeightKg)}
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Box
                              sx={{
                                width: 16,
                                height: 16,
                                borderRadius: '999px',
                                bgcolor: 'rgba(239, 68, 68, 0.7)',
                              }}
                            />
                            <Typography variant="body2">
                              Non-recyclable {formatKg(report.totals.nonRecyclableWeightKg)}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            {visibility.timeline && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<LineChart className="h-5 w-5 text-sky-500" />}
                  title="Trend over time"
                  subheader="Track the daily waste collected for the selected filters"
                />
                <CardContent>
                  <TimelineSparkline data={report.charts.timeSeries} />
                </CardContent>
              </Card>
            )}

            {/* Household table */}
            {visibility.households && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<BarChart3 className="h-5 w-5 text-brand-600" />}
                  title="Waste generated per household"
                  subheader="Top contributors by total kilograms"
                />
                <CardContent>
                  <Stack spacing={2}>
                    {(report.tables.households || []).slice(0, 12).map((household) => (
                      <Box
                        key={household.householdId}
                        className="rounded-2xl border border-slate-100 bg-white/80 px-4 py-3"
                      >
                        <Stack
                          direction={{ xs: 'column', md: 'row' }}
                          justifyContent="space-between"
                          alignItems={{ xs: 'flex-start', md: 'center' }}
                          spacing={2}
                        >
                          <Stack spacing={0.25}>
                            <Typography variant="subtitle1" fontWeight={600}>
                              {household.householdId}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {household.region} • {household.billingModel}
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={3}>
                            <Chip
                              label={`${household.pickups} pickups`}
                              variant="outlined"
                              color="default"
                            />
                            <Chip label={formatKg(household.totalKg)} color="success" />
                          </Stack>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                  <Divider sx={{ my: 3 }} />
                  <Typography variant="caption" color="text.secondary">
                    Showing top {Math.min((report.tables.households || []).length, 12)} of{' '}
                    {(report.tables.households || []).length} households by total collected weight.
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Stack>
        )}
      </Stack>
    </div>
  );
}

ReportsPage.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
  }).isRequired,
};
