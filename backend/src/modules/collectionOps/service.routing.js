const lk = require('../../config/region.lk.json');
const R = 6371, toRad = d => d * Math.PI / 180;
const dkm = (a, b) => {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const estimateKg = (bin) => {
  const days = Math.max(1, (Date.now() - (bin.lastPickupAt ? new Date(bin.lastPickupAt) : Date.now())) / 86400000);
  return Math.min(bin.capacityKg, (bin.estRateKgPerDay || 3) * days);
};

function optimize({ bins, depot = lk.operations.default_depot, capacityKg = lk.operations.truck_capacity_kg, threshold = lk.operations.route_threshold }) {
  const cands = bins.map(b => ({ ...b, estKg: estimateKg(b) }))
    .filter(b => (b.estKg / b.capacityKg) >= threshold);

  let cur = depot, remaining = [...cands], order = [], load = 0;
  while (remaining.length) {
    let bestI = 0, best = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dkm(cur, remaining[i].location);
      if (d < best) { best = d; bestI = i; }
    }
    const next = remaining.splice(bestI, 1)[0];
    if (load + next.estKg > capacityKg) break;
    order.push({ binId: next.binId, lat: next.location.lat, lon: next.location.lon, estKg: Math.round(next.estKg) });
    load += next.estKg; cur = next.location;
  }
  let dist = 0; cur = depot;
  for (const s of order) { dist += dkm(cur, s); cur = s; }
  dist += dkm(cur, depot);
  return { stops: order, loadKg: Math.round(load), distanceKm: +dist.toFixed(2) };
}
module.exports = { optimize };
