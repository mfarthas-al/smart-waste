import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveLabel = value => {
  if (!value) return 'rectangle'
  if (Array.isArray(value)) {
    for (const item of value) {
      const label = resolveLabel(item)
      if (label !== 'rectangle') return label
    }
    return 'rectangle'
  }
  if (typeof value === 'string') return value.replace(/\s+/g, '-')
  if (value?.props?.children) return resolveLabel(value.props.children)
  return 'rectangle'
}

const mapMocks = vi.hoisted(() => ({
  mapInstance: { fitBounds: vi.fn() },
  latLngBoundsMock: vi.fn(bounds => bounds),
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Rectangle: ({ children, eventHandlers }) => {
    const label = resolveLabel(children)
    return (
      <div data-testid={`rectangle-${label}`} onClick={() => eventHandlers?.click?.()}>
        {children}
      </div>
    )
  },
  Popup: ({ children }) => <span>{children}</span>,
  useMap: () => mapMocks.mapInstance,
  __setMapInstance: newMap => {
    mapMocks.mapInstance = newMap
  },
}))

vi.mock('leaflet', () => ({
  default: { latLngBounds: mapMocks.latLngBoundsMock },
  latLngBounds: mapMocks.latLngBoundsMock,
}))

import MiniZoneMap from '../MiniZoneMap.jsx'
import { __setMapInstance } from 'react-leaflet'

describe('MiniZoneMap', () => {
  const cities = [
    {
      name: 'Colombo',
      bbox: [
        [6.85, 79.85],
        [6.95, 79.95],
      ],
      depot: { lat: 6.9, lon: 79.9 },
    },
    {
      name: 'Kandy',
      bbox: [
        [7.25, 80.55],
        [7.35, 80.65],
      ],
      depot: { lat: 7.3, lon: 80.6 },
    },
  ]

  let fitBoundsMock

  beforeEach(() => {
    fitBoundsMock = vi.fn()
    __setMapInstance({ fitBounds: fitBoundsMock })
    mapMocks.latLngBoundsMock.mockClear()
  })

  it('fits the map to the selected city bounding box', async () => {
    render(<MiniZoneMap cities={cities} selectedCity="Kandy" onSelectCity={() => {}} />)

    await waitFor(() => {
      expect(mapMocks.latLngBoundsMock).toHaveBeenCalledWith(cities[1].bbox)
      expect(fitBoundsMock).toHaveBeenCalledWith(cities[1].bbox, { padding: [20, 20] })
    })
  })

  it('falls back to the first city when the selection is unavailable', async () => {
    render(<MiniZoneMap cities={cities} selectedCity="Galle" onSelectCity={() => {}} />)

    await waitFor(() => {
      expect(mapMocks.latLngBoundsMock).toHaveBeenCalledWith(cities[0].bbox)
      expect(fitBoundsMock).toHaveBeenCalledWith(cities[0].bbox, { padding: [20, 20] })
    })
  })

  it('notifies when a city rectangle is clicked', async () => {
    const onSelectCity = vi.fn()
    const user = userEvent.setup()

    render(<MiniZoneMap cities={cities} selectedCity="Colombo" onSelectCity={onSelectCity} />)

    const rectangles = await screen.findAllByTestId('rectangle-Kandy')
    await user.click(rectangles[rectangles.length - 1])

    await waitFor(() => {
      expect(onSelectCity).toHaveBeenCalledWith('Kandy')
    })
  })
})
