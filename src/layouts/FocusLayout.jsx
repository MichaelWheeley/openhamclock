/**
 * FocusLayout — four purpose-built layouts sharing one chassis:
 * header, a dominant map, and a focus-specific panel rail.
 *
 *   activator  — POTA/SOTA in the field: self-spot, activations, RBN, repeaters
 *   hunter     — chasing activators: cluster, activations, sun & moon
 *   weather    — wx radar, lightning, hazards, aurora + space weather panels
 *   airtraffic — aircraft + ATC sectors over a big map, world clocks
 *
 * Entering a focus layout applies its layer preset once: `mapLayers`
 * toggles (spot markers, paths…) plus plugin map layers via the
 * window.hamclockLayerControls bridge WorldMap registers after mount.
 * Changes the user makes afterwards stick until the layout is re-entered —
 * re-picking the layout IS the "give me the standard view again" gesture.
 */
import { useEffect } from 'react';
import {
  Header,
  WorldMap,
  DXClusterPanel,
  PotaSotaPanel,
  WeatherPanel,
  SWPCAlertsPanel,
  POTAActivatorPanel,
  RBNMySignalPanel,
  RepeatersPanel,
  WorldClockPanel,
  SunMoonPanel,
  SpaceWxTrendsPanel,
  StopwatchPanel,
} from '../components';
import { useRig } from '../contexts/RigContext.jsx';
import { findDXPathForSpot } from '../utils/dxClusterSpotMatcher';
import useBreakpoint from '../hooks/app/useBreakpoint';

export const FOCUS_LAYOUT_IDS = ['activator', 'hunter', 'weather', 'airtraffic'];

// Per-focus presets. mapLayers: desired state for App-level toggles.
// pluginLayers: desired state for layer-registry layers (bridge ids).
const SPECS = {
  activator: {
    title: 'ACTIVATOR',
    accent: '#44cc44',
    panels: ['activator-spot', 'activations', 'rbn-mine', 'repeaters'],
    mapLayers: { showPOTA: true, showSOTA: true, showWWFF: true, showDeDxMarkers: true },
    pluginLayers: {},
  },
  hunter: {
    title: 'HUNTER',
    accent: 'var(--accent-amber)',
    panels: ['dx-cluster', 'activations', 'sun-moon'],
    mapLayers: { showPOTA: true, showSOTA: true, showWWFF: true, showCANParks: true, showDXPaths: true },
    pluginLayers: { grayline: true },
  },
  weather: {
    title: 'WEATHER',
    accent: 'var(--accent-cyan)',
    panels: ['de-weather', 'swpc-alerts', 'swpc-trends'],
    mapLayers: {
      showPOTA: false,
      showSOTA: false,
      showWWFF: false,
      showWWBOTA: false,
      showCANParks: false,
      showDXPaths: false,
      showPSKReporter: false,
    },
    pluginLayers: {
      wxradar: true,
      lightning: true,
      earthquakes: true,
      wildfires: true,
      floods: true,
      'tornado-warnings': true,
      aurora: true,
    },
  },
  airtraffic: {
    title: 'AIR TRAFFIC',
    accent: 'var(--accent-blue)',
    panels: ['world-clocks', 'de-weather', 'stopwatch'],
    mapLayers: {
      showPOTA: false,
      showSOTA: false,
      showWWFF: false,
      showWWBOTA: false,
      showCANParks: false,
      showDXPaths: false,
      showPSKReporter: false,
      showSatellites: false,
    },
    pluginLayers: { aircraft: true, 'atc-sectors': true },
  },
};

export default function FocusLayout(props) {
  const {
    focus,
    config,
    t,
    utcTime,
    utcDate,
    localTime,
    localDate,
    localWeather,
    localAlerts,
    spaceWeather,
    solarIndices,
    bandConditions,
    use12Hour,
    handleTimeFormatToggle,
    setShowSettings,
    handleUpdateClick,
    handleFullscreenToggle,
    isFullscreen,
    updateInProgress,
    isLocalInstall,
    dxLocation,
    dxLocked,
    handleDXChange,
    dxClusterData,
    potaSpots,
    filteredPotaSpots,
    wwffSpots,
    filteredWwffSpots,
    sotaSpots,
    filteredSotaSpots,
    wwbotaSpots,
    filteredWwbotaSpots,
    canparksSpots,
    filteredCanparksSpots,
    mySpots,
    swpcAlerts,
    filteredPskSpots,
    wsjtxMapSpots,
    dxFilters,
    setDxFilters,
    mapBandFilter,
    setMapBandFilter,
    pskFilters,
    setShowDXFilters,
    setShowPotaFilters,
    setShowSotaFilters,
    setShowWwffFilters,
    setShowWwbotaFilters,
    setShowCanparksFilters,
    potaFilters,
    sotaFilters,
    wwffFilters,
    wwbotaFilters,
    canparksFilters,
    mapLayers,
    toggleDeDxMarkers,
    toggleDXPaths,
    toggleDXLabels,
    togglePOTA,
    togglePOTALabels,
    toggleWWFF,
    toggleWWFFLabels,
    toggleSOTA,
    toggleSOTALabels,
    toggleWWBOTA,
    toggleWWBOTALabels,
    toggleCANParks,
    toggleCANParksLabels,
    toggleSatellites,
    togglePSKReporter,
    hoveredSpot,
    setHoveredSpot,
    filteredSatellites,
  } = props;

  const spec = SPECS[focus] || SPECS.activator;
  const { tuneTo } = useRig();
  const { breakpoint } = useBreakpoint();
  const isNarrow = breakpoint !== 'desktop';

  // ── Apply the focus layer preset once per entry ─────────────────────────
  const mapLayerToggles = {
    showDeDxMarkers: toggleDeDxMarkers,
    showDXPaths: toggleDXPaths,
    showPOTA: togglePOTA,
    showWWFF: toggleWWFF,
    showSOTA: toggleSOTA,
    showWWBOTA: toggleWWBOTA,
    showCANParks: toggleCANParks,
    showSatellites: toggleSatellites,
    showPSKReporter: togglePSKReporter,
  };
  useEffect(() => {
    // App-level toggles: flip only where actual state differs from wanted
    for (const [key, want] of Object.entries(spec.mapLayers)) {
      if (!!mapLayers[key] !== want) mapLayerToggles[key]?.();
    }
    // Plugin layers: the bridge appears once WorldMap mounts — retry briefly
    let tries = 0;
    const id = setInterval(() => {
      const ctl = window.hamclockLayerControls;
      if (!ctl?.layers?.length) {
        if (++tries > 20) clearInterval(id);
        return;
      }
      for (const [layerId, want] of Object.entries(spec.pluginLayers)) {
        const layer = ctl.layers.find((l) => l.id === layerId);
        if (layer && layer.enabled !== want) ctl.toggleLayer(layerId, want);
      }
      clearInterval(id);
    }, 500);
    return () => clearInterval(id);
    // Intentionally keyed on the focus only — this is an entry action, not sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const handleParkSpotClick = (spot) => {
    tuneTo(spot);
    if (spot.lat != null && spot.lon != null) {
      handleDXChange({ lat: spot.lat, lon: spot.lon, callsign: spot.call ?? null });
    }
  };
  const handleDXSpotClick = (spot) => {
    tuneTo(spot);
    const path = findDXPathForSpot(dxClusterData.paths || [], spot);
    if (path && path.dxLat != null && path.dxLon != null) {
      handleDXChange({ lat: path.dxLat, lon: path.dxLon, callsign: spot.call ?? spot.dxCall ?? null });
    }
  };

  // ── Panel builders (keyed by spec.panels ids) ───────────────────────────
  const panelEl = (id) => {
    switch (id) {
      case 'activator-spot':
        return <POTAActivatorPanel config={config} />;
      case 'rbn-mine':
        return <RBNMySignalPanel config={config} />;
      case 'repeaters':
        return <RepeatersPanel config={config} />;
      case 'world-clocks':
        return <WorldClockPanel />;
      case 'sun-moon':
        return <SunMoonPanel deLocation={config.location} dxLocation={dxLocation} />;
      case 'swpc-trends':
        return <SpaceWxTrendsPanel />;
      case 'stopwatch':
        return <StopwatchPanel />;
      case 'swpc-alerts':
        return <SWPCAlertsPanel data={swpcAlerts?.data} loading={swpcAlerts?.loading} error={swpcAlerts?.error} />;
      case 'de-weather':
        return (
          <div className="panel" style={{ padding: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--accent-cyan)', fontWeight: 700, marginBottom: '6px' }}>
              {t('app.dxLocation.deTitle')}
            </div>
            <WeatherPanel weatherData={localWeather} allUnits={config.allUnits} alerts={localAlerts} />
          </div>
        );
      case 'dx-cluster':
        return (
          <DXClusterPanel
            data={dxClusterData.spots}
            loading={dxClusterData.loading}
            error={dxClusterData.error}
            totalSpots={dxClusterData.totalSpots}
            filters={dxFilters}
            onFilterChange={setDxFilters}
            onOpenFilters={() => setShowDXFilters(true)}
            onHoverSpot={setHoveredSpot}
            onSpotClick={handleDXSpotClick}
            hoveredSpot={hoveredSpot}
            showOnMap={mapLayers.showDXPaths}
            onToggleMap={toggleDXPaths}
            userCallsign={config.callsign}
            deLat={config.location?.lat}
            deLon={config.location?.lon}
          />
        );
      case 'activations':
        return (
          <PotaSotaPanel
            potaData={potaSpots.data}
            potaLoading={potaSpots.loading}
            potaLastUpdated={potaSpots.lastUpdated}
            potaLastChecked={potaSpots.lastChecked}
            showPOTA={mapLayers.showPOTA}
            onTogglePOTA={togglePOTA}
            showPOTALabels={mapLayers.showPOTALabels}
            togglePOTALabels={togglePOTALabels}
            onPOTASpotClick={handleParkSpotClick}
            onPOTAHoverSpot={setHoveredSpot}
            potaFilters={potaFilters}
            setShowPotaFilters={setShowPotaFilters}
            filteredPotaSpots={filteredPotaSpots}
            sotaData={sotaSpots.data}
            sotaLoading={sotaSpots.loading}
            sotaLastUpdated={sotaSpots.lastUpdated}
            sotaLastChecked={sotaSpots.lastChecked}
            showSOTA={mapLayers.showSOTA}
            onToggleSOTA={toggleSOTA}
            showSOTALabels={mapLayers.showSOTALabels}
            toggleSOTALabels={toggleSOTALabels}
            onSOTASpotClick={handleParkSpotClick}
            onSOTAHoverSpot={setHoveredSpot}
            sotaFilters={sotaFilters}
            setShowSotaFilters={setShowSotaFilters}
            filteredSotaSpots={filteredSotaSpots}
            wwffData={wwffSpots.data}
            wwffLoading={wwffSpots.loading}
            wwffLastUpdated={wwffSpots.lastUpdated}
            wwffLastChecked={wwffSpots.lastChecked}
            showWWFF={mapLayers.showWWFF}
            onToggleWWFF={toggleWWFF}
            showWWFFLabels={mapLayers.showWWFFLabels}
            toggleWWFFLabels={toggleWWFFLabels}
            onWWFFSpotClick={handleParkSpotClick}
            onWWFFHoverSpot={setHoveredSpot}
            wwffFilters={wwffFilters}
            setShowWwffFilters={setShowWwffFilters}
            filteredWwffSpots={filteredWwffSpots}
            wwbotaData={wwbotaSpots.data}
            wwbotaLoading={wwbotaSpots.loading}
            wwbotaLastUpdated={wwbotaSpots.lastUpdated}
            wwbotaConnected={wwbotaSpots.connected}
            showWWBOTA={mapLayers.showWWBOTA}
            onToggleWWBOTA={toggleWWBOTA}
            showWWBOTALabels={mapLayers.showWWBOTALabels}
            toggleWWBOTALabels={toggleWWBOTALabels}
            onWWBOTASpotClick={handleParkSpotClick}
            onWWBOTAHoverSpot={setHoveredSpot}
            wwbotaFilters={wwbotaFilters}
            setShowWwbotaFilters={setShowWwbotaFilters}
            filteredWwbotaSpots={filteredWwbotaSpots}
            canparksData={canparksSpots.data}
            canparksLoading={canparksSpots.loading}
            canparksLastUpdated={canparksSpots.lastUpdated}
            canparksLastChecked={canparksSpots.lastChecked}
            showCANParks={mapLayers.showCANParks}
            onToggleCANParks={toggleCANParks}
            showCANParksLabels={mapLayers.showCANParksLabels}
            toggleCANParksLabels={toggleCANParksLabels}
            onCANParksSpotClick={handleParkSpotClick}
            onCANParksHoverSpot={setHoveredSpot}
            canparksFilters={canparksFilters}
            setShowCanparksFilters={setShowCanparksFilters}
            filteredCanparksSpots={filteredCanparksSpots}
          />
        );
      default:
        return null;
    }
  };

  const mapEl = (
    <div
      style={{
        position: 'relative',
        borderRadius: '6px',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <WorldMap
        config={config}
        isLocalInstall={isLocalInstall}
        deLocation={config.location}
        dxLocation={dxLocation}
        onDXChange={handleDXChange}
        dxLocked={dxLocked}
        potaSpots={filteredPotaSpots ? filteredPotaSpots : potaSpots.data}
        wwffSpots={filteredWwffSpots ? filteredWwffSpots : wwffSpots.data}
        sotaSpots={filteredSotaSpots ? filteredSotaSpots : sotaSpots.data}
        wwbotaSpots={filteredWwbotaSpots ? filteredWwbotaSpots : wwbotaSpots.data}
        canparksSpots={filteredCanparksSpots ? filteredCanparksSpots : canparksSpots.data}
        mySpots={mySpots.data}
        dxPaths={dxClusterData.paths}
        dxFilters={dxFilters}
        mapBandFilter={mapBandFilter}
        onMapBandFilterChange={setMapBandFilter}
        satellites={filteredSatellites}
        pskReporterSpots={filteredPskSpots}
        showDeDxMarkers={mapLayers.showDeDxMarkers}
        showDXPaths={mapLayers.showDXPaths}
        showDXLabels={mapLayers.showDXLabels}
        onToggleDXLabels={toggleDXLabels}
        showPOTA={mapLayers.showPOTA}
        showPOTALabels={mapLayers.showPOTALabels}
        showWWFF={mapLayers.showWWFF}
        showWWFFLabels={mapLayers.showWWFFLabels}
        showSOTA={mapLayers.showSOTA}
        showSOTALabels={mapLayers.showSOTALabels}
        showWWBOTA={mapLayers.showWWBOTA}
        showCANParks={mapLayers.showCANParks}
        showSatellites={mapLayers.showSatellites}
        showPSKReporter={mapLayers.showPSKReporter}
        showPSKPaths={mapLayers.showPSKPaths}
        showMutualReception={config.showMutualReception !== false}
        wsjtxSpots={wsjtxMapSpots}
        showWSJTX={mapLayers.showWSJTX}
        showDXNews={mapLayers.showDXNews}
        onToggleSatellites={toggleSatellites}
        hoveredSpot={hoveredSpot}
        callsign={config.callsign}
        lowMemoryMode={config.lowMemoryMode}
        allUnits={config.allUnits}
        mouseZoom={config.mouseZoom}
        onSpotClick={tuneTo}
      />
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '2px',
          color: spec.accent,
          background: 'rgba(0,0,0,0.7)',
          padding: '2px 10px',
          borderRadius: '4px',
          pointerEvents: 'none',
        }}
      >
        {spec.title}
      </div>
    </div>
  );

  const headerEl = (
    <Header
      config={config}
      utcTime={utcTime}
      utcDate={utcDate}
      localTime={localTime}
      localDate={localDate}
      localWeather={localWeather}
      spaceWeather={spaceWeather}
      solarIndices={solarIndices}
      bandConditions={bandConditions}
      use12Hour={use12Hour}
      onTimeFormatToggle={handleTimeFormatToggle}
      onSettingsClick={() => setShowSettings(true)}
      onUpdateClick={handleUpdateClick}
      onFullscreenToggle={handleFullscreenToggle}
      isFullscreen={isFullscreen}
      updateInProgress={updateInProgress}
      showUpdateButton={isLocalInstall}
      breakpoint={breakpoint}
    />
  );

  // Narrow screens: map on top, panels stacked below
  if (isNarrow) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, padding: '4px 6px' }}>{headerEl}</div>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ width: '100%', height: '50vh', minHeight: '260px', flexShrink: 0 }}>{mapEl}</div>
          {spec.panels.map((id) => (
            <div key={id} style={{ minHeight: '220px', flexShrink: 0 }}>
              {panelEl(id)}
            </div>
          ))}
          <div style={{ height: '20px', flexShrink: 0 }} />
        </div>
      </div>
    );
  }

  // Desktop: header | map + right rail
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'grid',
        gridTemplateColumns: '1fr clamp(300px, 22vw, 460px)',
        gridTemplateRows: 'auto 1fr',
        gap: '8px',
        padding: '8px',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ gridColumn: '1 / -1' }}>{headerEl}</div>
      {mapEl}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden', minHeight: 0 }}>
        {spec.panels.map((id) => (
          <div key={id} style={{ flex: '1 1 0', minHeight: '120px', overflow: 'hidden' }}>
            {panelEl(id)}
          </div>
        ))}
      </div>
    </div>
  );
}
