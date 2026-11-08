import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  CloudOff,
  Download,
  Droplets,
  Gauge,
  House,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Navigation,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Route,
  Signal,
  Truck,
  Users,
  Wrench,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import './App.css'
import {
  CENTER,
  INTAKE,
  ROUTE_COLORS,
  STATUS_COLORS,
  TRUCK_CAPACITY_LITRES,
  createRoutes,
  deliveryLitres,
  initialHouseholds,
  initialTrucks,
  loadCommunityHouseholds,
  priorityFor,
  statusFor,
  type Household,
  type RoutePlan,
  type TruckState,
  type WaterTruck,
} from './data'

type Page = 'operations' | 'driver'
type DriverStep = 'checkin' | 'route' | 'active' | 'complete'
type Simulation = { truckId: number; progress: number }

const formatLitres = (litres: number) => `${litres.toLocaleString('en-CA')} L`
const tutorialSteps = [
  { title: 'Community at a glance', text: 'See urgent homes, low tanks and available trucks.' },
  { title: 'Set today’s capacity', text: 'Update truck status and available water before dispatch.' },
  { title: 'Read the live map', text: 'Green, yellow and red homes show delivery urgency.' },
  { title: 'Build and run', text: 'Build the optimized plan, then simulate dispatch.' },
  { title: 'See the driver experience', text: 'After testing the route, open Driver app to preview the trucker’s mobile workflow.' },
]
const formatRepairDelay = (hours: number) => hours < 24 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${Math.floor(hours / 24)}d ${hours % 24}h (${hours} hours)`

function waterTruckIcon(color: string, heading: number) {
  const html = `<div class="water-truck-pin" style="--truck-color:${color};--heading:${heading}deg"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17h4V5H2v12h3"/><path d="M14 9h4l4 4v4h-3"/><path d="M14 13h8"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/></svg></div>`
  return L.divIcon({ className: 'vehicle-marker', html, iconSize: [42, 42], iconAnchor: [21, 21] })
}

function navigationTruckIcon(color: string, heading: number) {
  const html = `<div class="navigation-truck-pin" style="--truck-color:${color};--heading:${heading + 90}deg"><svg viewBox="0 0 24 36" aria-hidden="true"><rect x="5" y="2" width="14" height="11" rx="3"/><path d="M8 6h8M7 11h10"/><rect x="4" y="12" width="16" height="21" rx="7"/><path d="M8 17h8M8 21h8M8 25h8"/><path d="M3 16v5M21 16v5M3 26v4M21 26v4"/></svg></div>`
  return L.divIcon({ className: 'navigation-truck-marker', html, iconSize: [46, 52], iconAnchor: [23, 26] })
}

function routeStopProgresses(route: RoutePlan, homes: Household[]) {
  const cumulative = [0]
  for (let point = 1; point < route.geometry.length; point += 1) {
    const from = route.geometry[point - 1]
    const to = route.geometry[point]
    cumulative.push(cumulative[point - 1] + Math.hypot((to[0] - from[0]) * 111, (to[1] - from[1]) * 58))
  }
  let minimumIndex = 0
  return homes.map((home) => {
    let nearestIndex = minimumIndex
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let index = minimumIndex; index < route.geometry.length; index += 1) {
      const candidateDistance = Math.hypot((route.geometry[index][0] - home.position[0]) * 111, (route.geometry[index][1] - home.position[1]) * 58)
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance
        nearestIndex = index
      }
    }
    minimumIndex = nearestIndex
    return cumulative[nearestIndex] / Math.max(1, cumulative[cumulative.length - 1])
  })
}

function stopIcon(stop: number, status: ReturnType<typeof statusFor>) {
  return L.divIcon({ className: 'driver-stop-marker', html: `<span class="${status}">${stop}</span>`, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12] })
}

function FitRoutes({ routes }: { routes: RoutePlan[] }) {
  const map = useMap()
  useEffect(() => {
    const points = routes.flatMap((route) => route.geometry)
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [45, 45], maxZoom: 15 })
  }, [map, routes])
  return null
}

function FocusPoint({ position, follow = false }: { position?: [number, number]; follow?: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!position) return
    if (follow) map.setView(position, 16.5, { animate: false })
    else map.flyTo(position, 16.5, { duration: .6 })
  }, [follow, map, position])
  return null
}

function HouseDetails({ home, route, trucks }: { home: Household; route?: RoutePlan; trucks: WaterTruck[] }) {
  const status = statusFor(home)
  const stop = route ? route.stops.indexOf(home.id) + 1 : 0
  return (
    <div className="map-house-card">
      <div className="popup-heading"><span className={`house-icon ${status}`}><House size={18} /></span><div><small>{home.sector.toUpperCase()}</small><strong>{home.name}</strong></div><b className={`status-pill ${status}`}>{status === 'low' ? 'LOW' : status.toUpperCase()}</b></div>
      <div className="popup-tanks">
        <div><span>Fresh water <strong>{home.water}%</strong></span><i><b className={status} style={{ width: `${home.water}%` }} /></i><small>{Math.round(home.water * 10)} L estimated</small></div>
        <div><span>Wastewater <strong>{home.wastewater}%</strong></span><i><b className={home.wastewater > 80 ? 'critical' : 'waste'} style={{ width: `${home.wastewater}%` }} /></i><small>{Math.round((100 - home.wastewater) * 10)} L capacity</small></div>
      </div>
      <div className="popup-facts"><span><Users size={13} /> {home.residents} residents</span><span><Clock3 size={13} /> {home.days} days waiting</span><span><Gauge size={13} /> Priority {priorityFor(home)}</span></div>
      {route ? <div className="popup-route"><Truck size={15} /><span><small>ASSIGNED ROUTE</small><strong>{trucks.find((truck) => truck.id === route.truckId)?.name} · Stop {stop}</strong></span><b>{formatLitres(route.allocations.find((allocation) => allocation.homeId === home.id)?.litres || deliveryLitres(home))}</b></div> : <div className="popup-unassigned">Not assigned to today’s route</div>}
    </div>
  )
}

function BaseMap({ homes, routes, trucks, selectedId, onSelect, simulation = [], driver = false, focus, navigation = false }: {
  homes: Household[]
  routes: RoutePlan[]
  trucks: WaterTruck[]
  selectedId: number | null
  onSelect: (id: number) => void
  simulation?: Simulation[]
  driver?: boolean
  focus?: [number, number]
  navigation?: boolean
}) {
  const truckPose = (item: Simulation) => {
    const route = routes.find((candidate) => candidate.truckId === item.truckId)
    if (!route || route.geometry.length < 2) return { position: INTAKE, heading: 0 }
    const cumulative = [0]
    for (let point = 1; point < route.geometry.length; point += 1) {
      const from = route.geometry[point - 1]
      const to = route.geometry[point]
      cumulative.push(cumulative[point - 1] + Math.hypot((to[0] - from[0]) * 111, (to[1] - from[1]) * 58))
    }
    const target = item.progress * cumulative[cumulative.length - 1]
    let index = 0
    while (index < cumulative.length - 2 && cumulative[index + 1] < target) index += 1
    const from = route.geometry[index]
    const to = route.geometry[index + 1]
    const segmentLength = cumulative[index + 1] - cumulative[index]
    const fraction = segmentLength ? Math.min(1, (target - cumulative[index]) / segmentLength) : 0
    const position: [number, number] = [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction]
    const heading = Math.atan2(-(to[0] - from[0]), to[1] - from[1]) * 180 / Math.PI
    return { position, heading }
  }
  const primaryPose = simulation[0] ? truckPose(simulation[0]) : undefined
  return (
    <MapContainer center={driver && routes[0]?.geometry[0] ? routes[0].geometry[0] : CENTER} zoom={driver ? 14 : 14.5} zoomControl={!driver} className={`map ${navigation ? 'navigation-map' : ''}`}>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {!!routes.length && !navigation && <FitRoutes routes={driver ? routes.slice(0, 1) : routes} />}
      <FocusPoint position={navigation ? primaryPose?.position : focus} follow={navigation} />
      {routes.map((route, index) => <Polyline key={route.truckId} positions={route.geometry} pathOptions={{ color: ROUTE_COLORS[index], weight: driver ? 6 : 5, opacity: .88 }} />)}
      <Marker position={INTAKE} icon={L.divIcon({ className: 'depot-marker', html: '<span>R</span>', iconSize: [36, 36], iconAnchor: [18, 18] })}><Tooltip permanent direction="top" offset={[0, -16]}>River intake / refill</Tooltip></Marker>
      {homes.map((home) => {
        const status = statusFor(home)
        const route = routes.find((candidate) => candidate.stops.includes(home.id))
        const stop = route ? route.stops.indexOf(home.id) + 1 : 0
        if (driver && route) return <Marker key={home.id} position={home.position} icon={stopIcon(stop, status)} eventHandlers={{ click: () => onSelect(home.id) }}><Popup className="house-popup" minWidth={292} maxWidth={292}><HouseDetails home={home} route={route} trucks={trucks} /></Popup></Marker>
        if (driver && navigation) return null
        return <CircleMarker key={home.id} center={home.position} radius={selectedId === home.id ? 10 : route ? 8 : driver ? 4 : 6} eventHandlers={{ click: () => onSelect(home.id) }} pathOptions={{ color: selectedId === home.id ? '#111827' : '#fff', weight: selectedId === home.id ? 3 : route ? 2.5 : 2, fillColor: STATUS_COLORS[status], fillOpacity: driver ? .42 : 1 }}>
          <Popup className="house-popup" offset={[0, -6]} minWidth={292} maxWidth={292}><HouseDetails home={home} route={route} trucks={trucks} /></Popup>
        </CircleMarker>
      })}
      {simulation.map((item, index) => {
        const pose = truckPose(item)
        return <Marker key={item.truckId} position={pose.position} zIndexOffset={1000} icon={navigation ? navigationTruckIcon(ROUTE_COLORS[index], pose.heading) : waterTruckIcon(ROUTE_COLORS[index], pose.heading)}><Tooltip direction="top" offset={[0, -20]}>{trucks.find((truck) => truck.id === item.truckId)?.name} · Water truck</Tooltip></Marker>
      })}
    </MapContainer>
  )
}

function Header({ page, onPage, sensorCount, loadingHomes, tutorialStep, setTutorialStep }: { page: Page; onPage: (page: Page) => void; sensorCount: number; loadingHomes: boolean; tutorialStep: number; setTutorialStep: React.Dispatch<React.SetStateAction<number>> }) {
  const openDriver = () => {
    if (tutorialStep === 4) {
      sessionStorage.setItem('imiq-operations-tutorial', 'complete')
      setTutorialStep(-1)
    }
    onPage('driver')
  }
  return <header className={`topbar ${tutorialStep === 4 ? 'tutorial-header-focus' : ''}`}>
    <button className="brand" onClick={() => onPage('operations')}><span className="brand-mark"><Droplets size={19} /></span><span><strong>ᐃᒥᖅ · IMIQ</strong><small>Inukjuak Water Service</small></span></button>
    <nav><button className={page === 'operations' ? 'nav-active' : ''} onClick={() => onPage('operations')}><MapIcon size={16} /> Operations</button><button className={`${page === 'driver' ? 'nav-active' : ''} ${tutorialStep === 4 ? 'tutorial-focus' : ''}`} onClick={openDriver}><Truck size={16} /> Driver app</button></nav>
    <div className="system-state"><span className="pulse" /> Network online <span className="divider" /> <Radio size={14} /> {loadingHomes ? 'Discovering homes…' : `${sensorCount} / ${sensorCount} sensors`}</div>
  </header>
}

function OperationsPage({ homes, setHomes, trucks, setTrucks, routes, setRoutes, tutorialStep, setTutorialStep }: {
  homes: Household[]
  setHomes: React.Dispatch<React.SetStateAction<Household[]>>
  trucks: WaterTruck[]
  setTrucks: React.Dispatch<React.SetStateAction<WaterTruck[]>>
  routes: RoutePlan[]
  setRoutes: React.Dispatch<React.SetStateAction<RoutePlan[]>>
  tutorialStep: number
  setTutorialStep: React.Dispatch<React.SetStateAction<number>>
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [simulation, setSimulation] = useState<Simulation[]>([])
  const [running, setRunning] = useState(false)
  const [supplyPercent, setSupplyPercent] = useState(100)
  const [routing, setRouting] = useState(false)
  const [expandedQueue, setExpandedQueue] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('Just now')
  const sortedHomes = useMemo(() => [...homes].sort((a, b) => priorityFor(b) - priorityFor(a)), [homes])
  const urgent = homes.filter((home) => statusFor(home) === 'critical').length
  const low = homes.filter((home) => statusFor(home) === 'low').length
  const available = trucks.filter((truck) => truck.state !== 'repair').length
  const availableLitres = trucks.filter((truck) => truck.state !== 'repair').reduce((sum, truck) => sum + Math.floor(truck.capacityLitres * supplyPercent / 100), 0)
  const assignedHomes = routes.reduce((sum, route) => sum + route.stops.length, 0)

  useEffect(() => {
    if (!running || !routes.length) return
    let frame = 0
    let previous = performance.now()
    let accumulated = 0
    const animate = (now: number) => {
      accumulated += Math.min(now - previous, 100)
      previous = now
      if (accumulated >= 30) {
        const advance = accumulated / 28_000
        accumulated = 0
        setSimulation((current) => current.map((item) => ({ ...item, progress: Math.min(1, item.progress + advance) })))
      }
      frame = window.requestAnimationFrame(animate)
    }
    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [running, routes])

  const completed = simulation.length > 0 && simulation.every((item) => item.progress >= 1)

  useEffect(() => {
    if (!completed || !running) return
    window.setTimeout(() => {
      setRunning(false)
      const delivered = new Set(routes.flatMap((route) => route.stops))
      setHomes((all) => all.map((home) => delivered.has(home.id) ? { ...home, water: 100, days: 0 } : home))
      setTrucks((all) => all.map((truck) => truck.state === 'route' ? { ...truck, state: 'available' } : truck))
      setRoutes([])
      setSimulation([])
    }, 0)
  }, [completed, running, routes, setHomes, setRoutes, setTrucks])

  const planRoutes = async () => {
    setRouting(true)
    const next = await createRoutes(homes, trucks, supplyPercent)
    setRoutes(next)
    setSimulation(next.map((route) => ({ truckId: route.truckId, progress: 0 })))
    setRunning(false)
    setRouting(false)
  }

  const startRoutes = async () => {
    if (!routes.length) await planRoutes()
    setTrucks((all) => all.map((truck) => truck.state === 'available' ? { ...truck, state: 'route' } : truck))
    setRunning(true)
  }

  const setSupply = (value: number) => {
    setSupplyPercent(value)
    setRunning(false)
    setRoutes([])
    setSimulation([])
  }

  const setTruckState = (id: number, state: TruckState) => {
    setRunning(false)
    setRoutes([])
    setSimulation([])
    setTrucks((all) => all.map((truck) => truck.id === id ? { ...truck, state, repairHours: state === 'repair' ? truck.repairHours || 4 : undefined } : truck))
  }

  const closeTutorial = () => {
    sessionStorage.setItem('imiq-operations-tutorial', 'complete')
    setTutorialStep(-1)
  }

  const nextTutorialStep = () => {
    if (tutorialStep >= tutorialSteps.length - 1) closeTutorial()
    else setTutorialStep((step) => step + 1)
  }

  return <main className="operations-page">
    <section className={`summary-bar ${tutorialStep === 0 ? 'tutorial-focus' : ''}`}>
      <div className="place"><span className="eyebrow">SATURDAY, SEPTEMBER 26</span><h1>Community overview</h1><p>{homes.length} mapped households · Sensors updated <b>{lastUpdated}</b></p></div>
      <div className="summary-stat"><span className="stat-icon red"><AlertTriangle size={18} /></span><div><strong>{urgent}</strong><small>Critical homes</small></div></div>
      <div className="summary-stat"><span className="stat-icon yellow"><Droplets size={18} /></span><div><strong>{low}</strong><small>Running low</small></div></div>
      <div className="summary-stat"><span className="stat-icon green"><Truck size={18} /></span><div><strong>{available} / 3</strong><small>Trucks ready</small></div></div>
      <button className="outline-button" onClick={() => setLastUpdated('Just now')}><RefreshCw size={15} /> Refresh sensors</button>
    </section>
    <section className="workspace">
      <aside className={`operations-panel ${tutorialStep === 1 ? 'tutorial-focus' : ''}`}>
        <div className="section-title"><div><span className="eyebrow">FLEET</span><h2>Truck availability</h2></div><span className="ready-count">{available} ready</span></div>
        <div className="fleet-list">{trucks.map((truck, index) => <article className={`truck-card ${truck.state}`} key={truck.id}>
          <span className="truck-symbol" style={{ color: ROUTE_COLORS[index] }}><Truck size={20} /></span><div className="truck-copy"><strong>{truck.name}</strong><span>{truck.code} · {formatLitres(truck.capacityLitres)} tank</span></div>
          <div className="truck-action">{truck.state === 'repair' ? <><span className="repair-label"><Wrench size={12} /> Repair · {formatRepairDelay(truck.repairHours || 1)}</span><button onClick={() => setTruckState(truck.id, 'available')}>Check in</button></> : <><span className={`state-label ${truck.state}`}><i />{truck.state === 'route' ? 'On route' : 'Available'}</span><button onClick={() => setTruckState(truck.id, 'repair')}>{truck.state === 'route' ? 'Stop route' : 'Report issue'}</button></>}</div>
        </article>)}</div>
        <div className="planner">
          <div className="section-title compact"><div><span className="eyebrow">DISPATCH</span><h2>Build today’s routes</h2></div><Route size={20} /></div>
          <div className="capacity-line"><span>Truck fill available</span><strong>{formatLitres(availableLitres)} · {supplyPercent}%</strong></div><input type="range" min="25" max="100" step="25" value={supplyPercent} onChange={(event) => setSupply(Number(event.target.value))} /><div className="scale"><span>25% supply</span><span>Full truck tanks</span></div>
          <div className="planner-note"><Gauge size={17} /><span><strong>Territory optimization active</strong>High-need homes are grouped into compact truck areas, then ordered by road travel time to reduce overlap.</span></div>
        </div>
        <div className="priority-list"><div className="section-title compact"><div><span className="eyebrow">QUEUE</span><h2>Highest priority</h2></div><button className="text-button" onClick={() => setExpandedQueue((expanded) => !expanded)}>{expandedQueue ? 'Show less' : 'Show top 15'} <ChevronDown size={14} /></button></div>
          {sortedHomes.slice(0, expandedQueue ? 15 : 5).map((home, index) => <button className={`priority-row ${selectedId === home.id ? 'selected' : ''}`} key={home.id} onClick={() => setSelectedId(home.id)}><span className="rank">{String(index + 1).padStart(2, '0')}</span><i className={`status-dot ${statusFor(home)}`} /><span className="home-name"><strong>{home.name}</strong><small>{home.sector} · {home.water}% water</small></span><strong className="score">{priorityFor(home)}</strong></button>)}
        </div>
      </aside>
      <section className={`map-area ${tutorialStep === 2 ? 'tutorial-focus' : ''}`}>
        <BaseMap homes={homes} routes={routes} trucks={trucks} selectedId={selectedId} onSelect={setSelectedId} simulation={simulation} />
        <div className="map-top-left"><span><LocateFixed size={15} /> Inukjuak, Nunavik</span><small>Markers use mapped building centroids</small></div>
        <div className="legend"><span><i className="critical" /> Critical</span><span><i className="low" /> Low</span><span><i className="stable" /> Stable</span></div>
        <button className={`route-cta ${routes.length ? 'ready' : ''} ${running ? 'running' : ''} ${tutorialStep === 3 ? 'tutorial-focus' : ''}`} disabled={routing || available === 0} onClick={() => routes.length ? running ? setRunning(false) : startRoutes() : planRoutes()}>{routing ? <RefreshCw className="spin" size={25} /> : running ? <Pause size={25} /> : routes.length ? <Play size={25} /> : <Route size={25} />}<span><strong>{available === 0 ? 'No trucks available' : routing ? 'Building route…' : running ? 'Pause Dispatch' : routes.length ? 'Simulate Dispatch' : 'Build route'}</strong><small>{routes.length ? `${assignedHomes} homes · ${formatLitres(routes.reduce((sum, route) => sum + route.loadLitres, 0))}` : `${available} trucks · ${formatLitres(availableLitres)} available`}</small></span></button>
      </section>
    </section>
    {tutorialStep >= 0 && <><div className="tutorial-overlay" /><aside className={`tutorial-card ${tutorialStep === 3 ? 'tutorial-card-top' : ''}`} role="dialog" aria-label="Quick tour"><div className="tutorial-meta"><span>QUICK TOUR</span><b>{tutorialStep + 1} / {tutorialSteps.length}</b></div><h2>{tutorialSteps[tutorialStep].title}</h2><p>{tutorialSteps[tutorialStep].text}</p><div className="tutorial-dots">{tutorialSteps.map((_, index) => <i className={index === tutorialStep ? 'active' : ''} key={index} />)}</div><footer><button className="tutorial-skip" onClick={closeTutorial}>Skip</button><button className="tutorial-next" onClick={nextTutorialStep}>{tutorialStep === tutorialSteps.length - 1 ? 'Got it' : 'Next'} <ChevronRight size={15} /></button></footer></aside></>}
  </main>
}

function DriverPage({ homes, setHomes, trucks, setTrucks, routes, setRoutes }: {
  homes: Household[]
  setHomes: React.Dispatch<React.SetStateAction<Household[]>>
  trucks: WaterTruck[]
  setTrucks: React.Dispatch<React.SetStateAction<WaterTruck[]>>
  routes: RoutePlan[]
  setRoutes: React.Dispatch<React.SetStateAction<RoutePlan[]>>
}) {
  const [step, setStep] = useState<DriverStep>('checkin')
  const [offline, setOffline] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [loading, setLoading] = useState(false)
  const [repairHours, setRepairHours] = useState(4)
  const [showRepair, setShowRepair] = useState(false)
  const [currentStop, setCurrentStop] = useState(0)
  const [driverProgress, setDriverProgress] = useState(0)
  const [moving, setMoving] = useState(false)
  const [deliveryHistory, setDeliveryHistory] = useState<{ id: number; water: number; days: number }[]>([])
  const route = routes.find((candidate) => candidate.truckId === 1)
  const stopHomes = useMemo(() => route?.stops.map((id) => homes.find((home) => home.id === id)!).filter(Boolean) || [], [homes, route])
  const stopProgresses = useMemo(() => route ? routeStopProgresses(route, stopHomes) : [], [route, stopHomes])
  const activeHome = stopHomes[currentStop]
  const targetProgress = stopProgresses[currentStop] || 0
  const arrived = step === 'active' && !moving && driverProgress >= targetProgress - .0001
  const savingOffline = downloadProgress > 0 && downloadProgress < 100 && !offline

  useEffect(() => {
    if (step !== 'active' || !moving || !route) return
    let frame = 0
    let previous = performance.now()
    let accumulated = 0
    const animate = (now: number) => {
      accumulated += Math.min(now - previous, 100)
      previous = now
      if (accumulated >= 30) {
        const advance = accumulated / 42_000
        accumulated = 0
        setDriverProgress((progress) => {
          const next = Math.min(targetProgress, progress + advance)
          if (next >= targetProgress) window.setTimeout(() => setMoving(false), 0)
          return next
        })
      }
      frame = window.requestAnimationFrame(animate)
    }
    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [moving, route, step, targetProgress])

  const checkIn = async () => {
    setLoading(true)
    const readyTrucks = trucks.map((truck) => truck.id === 1 ? { ...truck, state: 'available' as const, repairHours: undefined } : truck)
    setTrucks(readyTrucks)
    const assigned = routes.find((candidate) => candidate.truckId === 1)
    const routeIsCurrent = assigned && assigned.stops.length > 0 && assigned.stops.every((id) => homes.some((home) => home.id === id))
    if (!routeIsCurrent) setRoutes(await createRoutes(homes, readyTrucks, 100))
    setLoading(false)
    setStep('route')
  }

  const adjustRepairHours = (change: number) => setRepairHours((hours) => Math.min(720, Math.max(1, hours + change)))

  const reportRepair = () => {
    setTrucks((all) => all.map((truck) => truck.id === 1 ? { ...truck, state: 'repair', repairHours } : truck))
    setShowRepair(false)
  }

  const downloadRoute = () => {
    if (!route || savingOffline) return
    setOffline(false)
    setDownloadProgress(8)
    let progress = 8
    const timer = window.setInterval(() => {
      progress = Math.min(100, progress + 12 + Math.round(Math.random() * 14))
      setDownloadProgress(progress)
      if (progress === 100) {
        window.clearInterval(timer)
        window.setTimeout(() => setOffline(true), 180)
      }
    }, 90)
  }

  const beginRoute = () => {
    setCurrentStop(0)
    setDriverProgress(0)
    setDeliveryHistory([])
    setMoving(true)
    setTrucks((all) => all.map((truck) => truck.id === 1 ? { ...truck, state: 'route' } : truck))
    setStep('active')
  }

  const completeStop = () => {
    if (!activeHome || moving || !arrived) return
    setDeliveryHistory((history) => [...history, { id: activeHome.id, water: activeHome.water, days: activeHome.days }])
    setHomes((all) => all.map((home) => home.id === activeHome.id ? { ...home, water: 100, days: 0 } : home))
    if (currentStop >= stopHomes.length - 1) {
      setTrucks((all) => all.map((truck) => truck.id === 1 ? { ...truck, state: 'available' } : truck))
      setStep('complete')
    } else {
      setCurrentStop((value) => value + 1)
      setMoving(true)
    }
  }

  const previousStop = () => {
    const previous = deliveryHistory[deliveryHistory.length - 1]
    if (!previous) return
    setHomes((all) => all.map((home) => home.id === previous.id ? { ...home, water: previous.water, days: previous.days } : home))
    setDeliveryHistory((history) => history.slice(0, -1))
    const previousIndex = Math.max(0, stopHomes.findIndex((home) => home.id === previous.id))
    setCurrentStop(previousIndex)
    setDriverProgress(stopProgresses[previousIndex] || 0)
    setMoving(false)
    setTrucks((all) => all.map((truck) => truck.id === 1 ? { ...truck, state: 'route' } : truck))
    setStep('active')
  }

  return <main className="driver-page">
    <div className="phone-shell"><div className="phone-speaker" /><div className="phone-screen"><div className="phone-status"><b>9:41</b><span><Signal size={12} /> LTE · 84%</span></div>
    <section className="driver-header"><div><span className="eyebrow">DRIVER APP · WT-01</span><h1>{step === 'checkin' ? 'Start your shift' : step === 'route' ? 'Today’s assigned route' : step === 'active' ? `Stop ${currentStop + 1} of ${stopHomes.length}` : 'Route complete'}</h1><p>{step === 'checkin' ? 'Confirm your truck status before dispatch builds the plan.' : 'Tasiujaq · Driver: Eli A.'}</p></div><div className="driver-sync"><Signal size={15} /> Synced just now</div></section>
    {step === 'checkin' && <section className="checkin-layout">
      <div className="workflow-progress"><span className="active"><b>1</b> Check in</span><i /><span><b>2</b> Review route</span><i /><span><b>3</b> Download</span><i /><span><b>4</b> Deliver</span></div>
      <div className="checkin-card"><span className="driver-truck"><Truck size={34} /></span><span className="eyebrow">ASSIGNED VEHICLE</span><h2>Tasiujaq <small>WT-01</small></h2><div className="vehicle-facts"><span><small>WATER CAPACITY</small><strong>{formatLitres(TRUCK_CAPACITY_LITRES)}</strong></span><span><small>EST. DELIVERIES</small><strong>15–25 homes</strong></span><span><small>LAST INSPECTION</small><strong>Yesterday</strong></span></div><h3>Can this truck go out today?</h3><p className="helper">Your status immediately updates dispatch and recalculates every driver’s route.</p><button className="ready-button" disabled={loading} onClick={checkIn}><CheckCircle2 size={20} />{loading ? 'Building your route…' : 'Yes, truck is ready'}<ChevronRight size={19} /></button><button className="issue-button" onClick={() => setShowRepair(!showRepair)}><Wrench size={18} /> No, report a truck issue</button>
        {showRepair && <div className="repair-form"><label>Estimated time out of service</label><strong className="repair-duration">{formatRepairDelay(repairHours)}</strong><div className="repair-adjustments">{[-10, -5, -1, 1, 5, 10].map((change) => <button key={change} onClick={() => adjustRepairHours(change)}>{change > 0 ? `+${change}` : change}h</button>)}</div><button className="repair-submit" onClick={reportRepair}>Send update to dispatch</button></div>}
      </div>
      <div className="why-status"><AlertTriangle size={18} /><div><strong>Why this matters</strong><p>If one truck is unavailable, IMIQ redistributes the highest-need homes between the trucks that can run.</p></div></div>
    </section>}
    {step === 'route' && route && <section className="driver-route-layout">
      <div className="driver-route-map"><BaseMap homes={homes} routes={[route]} trucks={trucks} selectedId={null} onSelect={() => undefined} driver /><div className="driver-map-label"><MapPin size={15} /> River intake → {route.stops.length} priority homes</div></div>
      <aside className="route-review"><button className="back-link" onClick={() => setStep('checkin')}><ArrowLeft size={15} /> Change status</button><span className="eyebrow">DISPATCHED ROUTE</span><h2>Route A · {route.stops.length} stops</h2><div className="route-metrics"><span><strong>{route.distance.toFixed(1)} km</strong><small>Total distance</small></span><span><strong>{Math.round(route.duration + route.stops.length * 12)} min</strong><small>With deliveries</small></span><span><strong>{formatLitres(route.loadLitres)}</strong><small>of {formatLitres(route.capacityLitres)}</small></span></div><div className="load-meter"><span style={{ width: `${route.loadLitres / route.capacityLitres * 100}%` }} /><small>{Math.round(route.loadLitres / route.capacityLitres * 100)}% of truck capacity allocated</small></div><div className="route-origin"><span>R</span><div><small>START & REFILL</small><strong>Innuksuak River intake</strong><p>Road-matched route begins near the airport intake.</p></div></div><div className="manifest-heading"><strong>Complete stop manifest</strong><span>{stopHomes.length} of {route.stops.length} loaded</span></div><div className="stop-preview">{stopHomes.map((home, index) => <div key={home.id}><b>{index + 1}</b><span><strong>{home.name}</strong><small>{home.sector} · {formatLitres(route.allocations.find((allocation) => allocation.homeId === home.id)?.litres || deliveryLitres(home))}</small></span><i className={`status-dot ${statusFor(home)}`} /></div>)}</div><div className={`offline-card ${offline ? 'downloaded' : savingOffline ? 'saving' : ''}`}><span>{offline ? <CheckCircle2 size={20} /> : savingOffline ? <RefreshCw className="spin" size={20} /> : <CloudOff size={20} />}</span><div><strong>{offline ? 'Download complete' : savingOffline ? 'Saving route to this device…' : 'Prepare for no signal'}</strong><p>{offline ? 'Map, every stop and household note are available offline in IMIQ.' : savingOffline ? `Saving offline map and ${stopHomes.length} stops` : 'Save the complete route in the app before leaving Wi-Fi.'}</p>{savingOffline && <div className="offline-progress"><i style={{ width: `${downloadProgress}%` }} /><small>{downloadProgress}%</small></div>}</div><button disabled={savingOffline || offline} onClick={downloadRoute}>{offline ? <><Check size={15} /> Saved</> : savingOffline ? `${downloadProgress}%` : <><Download size={15} /> Save offline</>}</button></div><button className="start-drive" disabled={!offline || stopHomes.length !== route.stops.length} onClick={beginRoute}><Navigation size={18} /> Start route</button>{!offline && <small className="download-hint">Save the route offline before starting.</small>}</aside>
    </section>}
    {step === 'active' && route && activeHome && <section className="active-drive">
      <div className="active-map"><BaseMap homes={homes} routes={[route]} trucks={trucks} selectedId={activeHome.id} onSelect={() => undefined} simulation={[{ truckId: route.truckId, progress: driverProgress }]} driver navigation /><div className="nav-instruction"><span><Navigation size={25} /></span><div><small>{moving ? 'DRIVING TO' : 'ARRIVED AT'} · {activeHome.sector.toUpperCase()}</small><strong>{activeHome.name}</strong><p>{moving ? 'Follow the highlighted route' : 'Waiting for delivery confirmation'}</p></div></div></div>
      <aside className="delivery-card"><div className="delivery-progress"><span style={{ width: `${((currentStop + 1) / stopHomes.length) * 100}%` }} /></div><span className="eyebrow">{moving ? 'NEXT ADDRESS' : 'ARRIVED'} · STOP {currentStop + 1} OF {stopHomes.length}</span><h2>{activeHome.name}</h2><p><MapPin size={14} /> {activeHome.sector}, Inukjuak</p><div className={`need-card ${statusFor(activeHome)}`}><span className={`status-dot ${statusFor(activeHome)}`} /><div><strong>{statusFor(activeHome) === 'critical' ? 'Critical need' : statusFor(activeHome) === 'low' ? 'Running low' : 'Stable'}</strong><small>{activeHome.water}% fresh water · {activeHome.days} days waiting</small></div><b>#{priorityFor(activeHome)}</b></div><div className="delivery-readings"><span><small>DELIVER</small><strong>{formatLitres(route.allocations.find((allocation) => allocation.homeId === activeHome.id)?.litres || deliveryLitres(activeHome))}</strong></span><span><small>RESIDENTS</small><strong>{activeHome.residents}</strong></span><span><small>BLACK WATER</small><strong>{activeHome.wastewater}%</strong></span></div>{activeHome.vulnerable && <div className="driver-note"><AlertTriangle size={16} /> Household assistance note on file</div>}<div className="delivery-actions"><button className="previous-stop" disabled={!deliveryHistory.length} onClick={previousStop}><ArrowLeft size={17} /> Previous</button><button className="complete-delivery" disabled={moving || !arrived} onClick={completeStop}>{moving ? <><Navigation size={18} /> En route…</> : <><Check size={19} /> Confirm done</>}</button></div><div className="offline-status"><CloudOff size={13} /> Offline route active · Changes will sync later</div></aside>
    </section>}
    {step === 'complete' && <section className="complete-screen"><span><CheckCircle2 size={42} /></span><h2>All assigned deliveries complete</h2><p>{stopHomes.length} homes received water. Your truck status is available and dispatch has been updated.</p><div><strong>{formatLitres(route?.loadLitres || 0)}</strong><small>delivered today</small></div><div className="complete-actions"><button className="previous-stop" onClick={previousStop}><ArrowLeft size={16} /> Last stop</button><button onClick={() => { setStep('checkin'); setOffline(false); setDownloadProgress(0); setCurrentStop(0); setDriverProgress(0); setMoving(false); setDeliveryHistory([]) }}>Finish shift</button></div></section>}
    </div></div>
  </main>
}

function App() {
  const [page, setPage] = useState<Page>('operations')
  const [tutorialStep, setTutorialStep] = useState(() => sessionStorage.getItem('imiq-operations-tutorial') ? -1 : 0)
  const [homes, setHomes] = useState(initialHouseholds)
  const [loadingHomes, setLoadingHomes] = useState(true)
  const [trucks, setTrucks] = useState(initialTrucks)
  const [routes, setRoutes] = useState<RoutePlan[]>([])

  useEffect(() => {
    let active = true
    loadCommunityHouseholds().then((communityHomes) => {
      if (!active) return
      setHomes(communityHomes)
      setRoutes([])
      setLoadingHomes(false)
    })
    return () => { active = false }
  }, [])

  return <div className="app-shell"><Header page={page} onPage={setPage} sensorCount={homes.length} loadingHomes={loadingHomes} tutorialStep={tutorialStep} setTutorialStep={setTutorialStep} />{page === 'operations' ? <OperationsPage homes={homes} setHomes={setHomes} trucks={trucks} setTrucks={setTrucks} routes={routes} setRoutes={setRoutes} tutorialStep={tutorialStep} setTutorialStep={setTutorialStep} /> : <DriverPage homes={homes} setHomes={setHomes} trucks={trucks} setTrucks={setTrucks} routes={routes} setRoutes={setRoutes} />}</div>
}

export default App
