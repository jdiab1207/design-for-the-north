export type Status = 'critical' | 'low' | 'stable'
export type TruckState = 'available' | 'route' | 'repair'
export type Household = {
  id: number
  name: string
  sector: string
  residents: number
  water: number
  wastewater: number
  days: number
  vulnerable: boolean
  position: [number, number]
  usage: number
}
export type WaterTruck = {
  id: number
  name: string
  code: string
  state: TruckState
  capacityLitres: number
  repairHours?: number
}
export type RoutePlan = {
  truckId: number
  stops: number[]
  allocations: { homeId: number; litres: number }[]
  loadLitres: number
  capacityLitres: number
  distance: number
  duration: number
  geometry: [number, number][]
}

export const CENTER: [number, number] = [58.45016366928364, -78.10975278568685]
export const INTAKE: [number, number] = [58.468638, -78.079106]
export const TRUCK_CAPACITY_LITRES = 13_600
export const HOUSEHOLD_TANK_LITRES = 1_000
export const ROUTE_COLORS = ['#2563eb', '#7c3aed', '#ea580c']
export const STATUS_COLORS: Record<Status, string> = {
  critical: '#dc2626',
  low: '#facc15',
  stable: '#16a34a',
}

const BUILDINGS: [number, number][] = [
  [58.4470475, -78.1082393], [58.447631, -78.1081262], [58.4479096, -78.1095453],
  [58.4482462, -78.1078112], [58.4484181, -78.1058546], [58.4485307, -78.1097139],
  [58.4486841, -78.1046798], [58.4488905, -78.1057661], [58.4489688, -78.1090753],
  [58.4491951, -78.1126568], [58.4493607, -78.1069543], [58.4495895, -78.1132922],
  [58.4497693, -78.1119041], [58.4498189, -78.1112949], [58.4499883, -78.1132051],
  [58.4501369, -78.1116091], [58.4503445, -78.1144726], [58.450583, -78.1150277],
  [58.4507534, -78.10745], [58.450816, -78.1091711], [58.4509654, -78.1081613],
  [58.4511717, -78.1096768], [58.451262, -78.1071191], [58.4515114, -78.1047938],
  [58.4515813, -78.1063897], [58.4517984, -78.1052792], [58.4521099, -78.1061845],
  [58.4522362, -78.104827], [58.4525029, -78.1042789], [58.4528606, -78.1036083],
  [58.4530172, -78.1029322], [58.4532424, -78.1075471], [58.4534771, -78.108294],
  [58.4537007, -78.1029097], [58.4538763, -78.1031062], [58.4543043, -78.1075675],
  [58.4545839, -78.1059163], [58.45476, -78.1027464], [58.4548815, -78.1070724],
]

const sectors = ['South shore', 'Old village', 'River bend', 'Central', 'North road']

export const initialHouseholds: Household[] = BUILDINGS.map((position, index) => ({
  id: index + 1,
  name: `Household ${String(index + 1).padStart(3, '0')}`,
  sector: sectors[Math.min(4, Math.floor(index / 8))],
  residents: 2 + ((index * 5) % 7),
  water: [8, 63, 29, 76, 17, 48, 91, 34, 12, 56, 23, 69, 42][index % 13],
  wastewater: [88, 34, 67, 21, 81, 52, 15, 64, 92, 46, 73, 27, 58][index % 13],
  days: [4, 1, 3, 0, 4, 2, 0, 2, 5, 1, 3, 1, 2][index % 13],
  vulnerable: index % 7 === 0 || index % 11 === 0,
  position,
  usage: 92 + ((index * 37) % 160),
}))

type OsmBuilding = {
  id: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

const excludedBuildingTypes = new Set(['commercial', 'church', 'civic', 'garage', 'garages', 'government', 'hangar', 'hospital', 'industrial', 'office', 'public', 'retail', 'school', 'service', 'shed', 'storage_tank', 'transportation', 'warehouse'])
const excludedTagGroups = ['aeroway', 'amenity', 'craft', 'healthcare', 'industrial', 'leisure', 'man_made', 'office', 'power', 'railway', 'shop', 'tourism']

function isLikelyHouse(building: OsmBuilding) {
  const tags = building.tags || {}
  if (!building.center || excludedBuildingTypes.has(tags.building)) return false
  if (excludedTagGroups.some((tag) => tag in tags)) return false
  return !tags.name
}

function sectorFor([lat, lng]: [number, number]) {
  if (lat < 58.449) return 'South shore'
  if (lng < -78.111) return 'West village'
  if (lat > 58.456) return 'North road'
  if (lng > -78.105) return 'River bend'
  return 'Central'
}

function householdsFromOsm(elements: OsmBuilding[]) {
  return elements.filter(isLikelyHouse).sort((a, b) => {
    const aCenter = a.center!
    const bCenter = b.center!
    return aCenter.lat - bCenter.lat || aCenter.lon - bCenter.lon
  }).map((building, index) => {
    const seed = Math.abs(building.id)
    const position: [number, number] = [building.center!.lat, building.center!.lon]
    return {
      id: building.id,
      name: `Household ${String(index + 1).padStart(3, '0')}`,
      sector: sectorFor(position),
      residents: 2 + ((seed * 5) % 7),
      water: [8, 63, 29, 76, 17, 48, 91, 34, 12, 56, 23, 69, 42][seed % 13],
      wastewater: [88, 34, 67, 21, 81, 52, 15, 64, 92, 46, 73, 27, 58][seed % 13],
      days: [4, 1, 3, 0, 4, 2, 0, 2, 5, 1, 3, 1, 2][seed % 13],
      vulnerable: seed % 7 === 0 || seed % 11 === 0,
      position,
      usage: 92 + ((seed * 37) % 160),
    }
  })
}

export async function loadCommunityHouseholds() {
  const cached = localStorage.getItem('imiq-inukjuak-homes-v2')
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { savedAt: number; homes: Household[] }
      if (Date.now() - parsed.savedAt < 86_400_000 && parsed.homes.length > initialHouseholds.length) return parsed.homes
    } catch {
      localStorage.removeItem('imiq-inukjuak-homes-v2')
    }
  }
  const query = '[out:json];way[building](58.444,-78.13,58.464,-78.096);out center tags;'
  const endpoints = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter']
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`)
      if (!response.ok) continue
      const data = await response.json() as { elements: OsmBuilding[] }
      const homes = householdsFromOsm(data.elements)
      if (homes.length <= initialHouseholds.length) continue
      localStorage.setItem('imiq-inukjuak-homes-v2', JSON.stringify({ savedAt: Date.now(), homes }))
      return homes
    } catch {
      continue
    }
  }
  return initialHouseholds
}

export const initialTrucks: WaterTruck[] = [
  { id: 1, name: 'Tasiujaq', code: 'WT-01', state: 'available', capacityLitres: TRUCK_CAPACITY_LITRES },
  { id: 2, name: 'Nanuq', code: 'WT-02', state: 'available', capacityLitres: TRUCK_CAPACITY_LITRES },
  { id: 3, name: 'Siku', code: 'WT-03', state: 'repair', capacityLitres: TRUCK_CAPACITY_LITRES, repairHours: 5 },
]

export function statusFor(home: Household): Status {
  if (home.water <= 15 || home.days >= 4 || home.wastewater >= 88) return 'critical'
  if (home.water <= 38 || home.days >= 3 || home.wastewater >= 70) return 'low'
  return 'stable'
}

export function priorityFor(home: Household) {
  return Math.round((100 - home.water) * .44 + home.days * 7 + home.wastewater * .18 + home.residents * 1.3 + (home.vulnerable ? 12 : 0))
}

export function deliveryLitres(home: Household) {
  return Math.max(100, Math.round((100 - home.water) * HOUSEHOLD_TANK_LITRES / 100 / 50) * 50)
}

function distance(a: [number, number], b: [number, number]) {
  const lat = (a[0] - b[0]) * 111
  const lng = (a[1] - b[1]) * 58
  return Math.sqrt(lat * lat + lng * lng)
}

async function roadGeometry(points: [number, number][]) {
  const coordinates = points.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`)
  if (!response.ok) throw new Error('Road routing unavailable')
  const data = await response.json()
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No road route found')
  return {
    geometry: data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]),
    distance: data.routes[0].distance / 1000,
    duration: data.routes[0].duration / 60,
  }
}

async function roadTimeMatrix(points: [number, number][]) {
  const coordinates = points.map(([lat, lng]) => `${lng},${lat}`).join(';')
  try {
    const response = await fetch(`https://router.project-osrm.org/table/v1/driving/${coordinates}?annotations=duration`)
    if (!response.ok) throw new Error('Road matrix unavailable')
    const data = await response.json() as { code: string; durations: (number | null)[][] }
    if (data.code !== 'Ok') throw new Error('Road matrix unavailable')
    return data.durations.map((row, from) => row.map((duration, to) => duration ?? distance(points[from], points[to]) * 240))
  } catch {
    return points.map((from) => points.map((to) => distance(from, to) * 240))
  }
}

function compactTerritories(homes: Household[], capacities: number[]) {
  if (!homes.length) return capacities.map(() => [] as Household[])
  const center: [number, number] = [
    homes.reduce((sum, home) => sum + home.position[0], 0) / homes.length,
    homes.reduce((sum, home) => sum + home.position[1], 0) / homes.length,
  ]
  const byAngle = [...homes].sort((a, b) => Math.atan2((a.position[0] - center[0]) * 111, (a.position[1] - center[1]) * 58) - Math.atan2((b.position[0] - center[0]) * 111, (b.position[1] - center[1]) * 58))
  const seeds = capacities.map((_, index) => byAngle[Math.min(byAngle.length - 1, Math.floor((index + .5) * byAngle.length / capacities.length))].position)
  const remaining = [...capacities]
  const loads = capacities.map(() => 0)
  const buckets = capacities.map(() => [] as Household[])
  const assignmentOrder = [...homes].sort((a, b) => deliveryLitres(b) - deliveryLitres(a) || priorityFor(b) - priorityFor(a))
  assignmentOrder.forEach((home) => {
    const litres = deliveryLitres(home)
    const eligible = capacities.map((capacity, index) => ({
      index,
      score: distance(home.position, seeds[index]) + loads[index] / Math.max(1, capacity) * .35,
    })).filter(({ index }) => remaining[index] >= litres).sort((a, b) => a.score - b.score || a.index - b.index)
    if (!eligible.length) return
    const selected = eligible[0].index
    buckets[selected].push(home)
    loads[selected] += litres
    remaining[selected] -= litres
  })
  return buckets
}

function routeCost(order: Household[], indexById: Map<number, number>, matrix: number[][]) {
  if (!order.length) return 0
  let cost = matrix[0][indexById.get(order[0].id)!]
  for (let index = 1; index < order.length; index += 1) cost += matrix[indexById.get(order[index - 1].id)!][indexById.get(order[index].id)!]
  return cost + matrix[indexById.get(order[order.length - 1].id)!][0]
}

function optimizeOrder(homes: Household[], indexById: Map<number, number>, matrix: number[][]) {
  const remaining = [...homes]
  const ordered: Household[] = []
  let current = 0
  while (remaining.length) {
    remaining.sort((a, b) => matrix[current][indexById.get(a.id)!] - matrix[current][indexById.get(b.id)!])
    const next = remaining.shift()!
    ordered.push(next)
    current = indexById.get(next.id)!
  }
  let best = ordered
  let bestCost = routeCost(best, indexById, matrix)
  for (let pass = 0; pass < 4; pass += 1) {
    let improved = false
    for (let start = 0; start < best.length - 1; start += 1) {
      for (let end = start + 1; end < best.length; end += 1) {
        const candidate = [...best.slice(0, start), ...best.slice(start, end + 1).reverse(), ...best.slice(end + 1)]
        const candidateCost = routeCost(candidate, indexById, matrix)
        if (candidateCost + .1 < bestCost) {
          best = candidate
          bestCost = candidateCost
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return best
}

export async function createRoutes(homes: Household[], trucks: WaterTruck[], supplyPercent = 100): Promise<RoutePlan[]> {
  const active = trucks.filter((truck) => truck.state !== 'repair')
  if (!active.length) return []
  const capacities = active.map((truck) => Math.floor(truck.capacityLitres * supplyPercent / 100))
  let totalRemaining = capacities.reduce((sum, capacity) => sum + capacity, 0)
  const selected: Household[] = []
  const candidates = [...homes].filter((home) => home.water < 65 || home.days >= 2).sort((a, b) => priorityFor(b) - priorityFor(a) || a.id - b.id)
  candidates.forEach((home) => {
    const litres = deliveryLitres(home)
    if (litres > totalRemaining) return
    selected.push(home)
    totalRemaining -= litres
  })
  const points: [number, number][] = [INTAKE, ...selected.map((home) => home.position)]
  const indexById = new Map(selected.map((home, index) => [home.id, index + 1]))
  const matrix = await roadTimeMatrix(points)
  const buckets = compactTerritories(selected, capacities)
  return Promise.all(active.map(async (truck, index) => {
    const ordered = optimizeOrder(buckets[index], indexById, matrix)
    const stops = ordered.map((home) => home.id)
    const allocations = ordered.map((home) => ({ homeId: home.id, litres: deliveryLitres(home) }))
    const loadLitres = allocations.reduce((sum, allocation) => sum + allocation.litres, 0)
    const capacityLitres = capacities[index]
    const routePoints: [number, number][] = [INTAKE, ...ordered.map((home) => home.position), INTAKE]
    try {
      const road = await roadGeometry(routePoints)
      return { truckId: truck.id, stops, allocations, loadLitres, capacityLitres, ...road }
    } catch {
      const total = routePoints.slice(1).reduce((sum, point, pointIndex) => sum + distance(routePoints[pointIndex], point), 0)
      return { truckId: truck.id, stops, allocations, loadLitres, capacityLitres, distance: total, duration: total * 4, geometry: routePoints }
    }
  }))
}
