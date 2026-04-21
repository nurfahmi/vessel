const kplerApi = require('../services/kplerApiService');
const db = require('../config/database');

/**
 * Generate business insights from vessel data
 */
function analyzeVessel(v) {
  const insights = [];
  const now = new Date();

  // Age analysis
  const age = v.build?.buildYear ? (now.getFullYear() - v.build.buildYear) : null;
  if (age && age > 20) insights.push({ type: 'warning', text: `Vessel is ${age} years old — higher maintenance costs, lower charter rates` });
  else if (age && age > 15) insights.push({ type: 'info', text: `${age} years old — mid-life vessel, may face age restrictions in some trades` });
  else if (age && age <= 5) insights.push({ type: 'success', text: `${age} years old — modern vessel, premium charter potential` });

  // State analysis
  const pc = v.portCallInfo?.lastPortCall;
  if (v.state === 'ballast') {
    insights.push({ type: 'info', text: 'Vessel is EMPTY (ballast) — available for next cargo' });
    if (pc?.vesselAvailability === 'Potentially Open') {
      insights.push({ type: 'success', text: 'Marked as "Potentially Open" — likely seeking spot cargo' });
    }
  } else if (v.state === 'loaded') {
    insights.push({ type: 'info', text: 'Vessel is LOADED — currently carrying cargo' });
  }

  // Idle detection
  const snap = v.positionSnapshot || v.lastPosition;
  if (snap?.speed !== undefined && snap.speed < 1) {
    insights.push({ type: 'warning', text: `Speed is ${snap.speed} knots — vessel is stationary (anchored or idle)` });
    if (pc?.estimatedBerthArrival) {
      const arrival = new Date(pc.estimatedBerthArrival);
      const daysIdle = Math.floor((now - arrival) / (1000 * 60 * 60 * 24));
      if (daysIdle > 3) {
        insights.push({ type: 'warning', text: `Has been at current location for ~${daysIdle} days` });
      }
    }
  }

  // Ethylene capability
  if (!v.isEthyleneCapable) {
    insights.push({ type: 'info', text: 'Not ethylene-capable — limited to LPG cargoes only' });
  } else {
    insights.push({ type: 'success', text: 'Ethylene-capable — can handle wider range of gas cargoes' });
  }

  // Charter status
  if (!v.charterContracts || v.charterContracts.length === 0) {
    insights.push({ type: 'info', text: 'No active charter contracts — spot market exposure' });
  }

  return insights;
}

const vesselAnalysisController = {
  // GET /vessel-intel/:kpler_id
  async show(req, res) {
    try {
      const kplerId = parseInt(req.params.kpler_id);

      // Check if recently enriched (< 6 hours) — skip API, use cached data
      const forceRefresh = req.query.refresh === '1';
      const SIX_HOURS = 6 * 60 * 60 * 1000;
      let [cachedRows] = await db.query('SELECT * FROM kpler_vessels WHERE kpler_id = ? AND enriched_at IS NOT NULL', [kplerId]);
      const isFresh = !forceRefresh && cachedRows.length && cachedRows[0].enriched_at && (Date.now() - new Date(cachedRows[0].enriched_at).getTime()) < SIX_HOURS;
      const lastUpdated = cachedRows.length && cachedRows[0].enriched_at ? cachedRows[0].enriched_at : null;

      // Build detail from cached DB row (reused for both isFresh and API-failure paths)
      const buildCachedDetail = (c) => ({
        name: c.name, imo: c.imo, mmsi: c.mmsi, callSign: c.call_sign,
        flag: c.flag || c.flag_name, status: c.status, state: c.state,
        type: c.vessel_type_class || 'VLGC', kplerId: c.kpler_id,
        shipClass: c.ship_class,
        builtYear: c.built_year || c.build_year, builtMonth: c.built_month,
        builtCountry: c.built_country, builder: c.builder,
        age: (c.built_year || c.build_year) ? (new Date().getFullYear() - (c.built_year || c.build_year)) : null,
        cbm: c.cbm || c.capacity_cbm, cargoType: c.cargo_type,
        numTanks: c.num_tanks || c.number_tanks,
        deadweight: c.deadweight, grossTonnage: c.gross_tonnage,
        beam: c.beam, maxSpeed: c.max_speed, horsepower: c.horsepower,
        isEthylene: c.is_ethylene_capable, isFloatingStorage: c.is_floating_storage,
        lat: c.lat ? parseFloat(c.lat) : null, lon: c.lon ? parseFloat(c.lon) : null,
        speed: c.speed ? parseFloat(c.speed) : null, heading: c.heading,
        draught: c.draught ? parseFloat(c.draught) : null, course: c.course ? parseFloat(c.course) : null,
        positionTime: c.position_time,
        aisDestination: c.ais_destination, aisEta: c.ais_eta,
        nextDestName: c.next_dest_name || c.next_dest_zone, nextDestCountry: c.next_dest_country,
        nextDestEta: c.next_dest_eta,
        loaded: c.loaded, cargoProducts: c.cargo_products ? c.cargo_products.split(', ') : [],
        currentVolume: c.current_volume ? parseFloat(c.current_volume) : null,
        currentMass: c.current_mass ? parseFloat(c.current_mass) : null,
        portName: c.zone_port || c.last_port_zone || c.last_port,
        country: c.zone_country || c.last_port_country,
        zones: c.parent_zones ? c.parent_zones.split(', ') : (c.position ? [c.position] : []),
        vesselAvailability: c.vessel_availability,
        arrival: c.estimated_berth_arrival || c.last_port_arrival,
        departure: c.estimated_berth_departure || c.last_port_departure,
        portCallOperation: c.port_call_operation || c.last_port_operation,
        partialCargo: !!c.partial_cargo, isSTS: !!c.is_sts,
        portCallTags: [],
        lastPortInstallation: c.last_port_installation || c.last_port,
        lastPortBerth: c.last_port_berth,
        stsPartner: c.sts_partner, stsVolume: c.sts_volume ? parseInt(c.sts_volume) : null,
        flowVolume: c.flow_volume ? parseInt(c.flow_volume) : null,
        flowMass: c.flow_mass ? parseInt(c.flow_mass) : null,
        confirmedGrades: c.confirmed_grades ? c.confirmed_grades.split(', ') : [],
        owner: c.owner, beneficialOwner: c.beneficial_owner,
        operator: c.operator, manager: c.manager,
        commercialManager: c.commercial_manager,
        controller: c.controller, controllerCountry: c.controller_country,
        ownerCountry: c.owner_country,
        thirdPartyOperator: c.third_party_operator,
        builderFull: c.builder,
        portCallsMetrics: c.unloads_this_year ? { unloads: c.unloads_this_year, unloadedThisYearInTon: c.unloaded_ton_this_year, hireRate: c.hire_rate } : null,
        charterContracts: c.charter_charterer ? [{ charterer: { name: c.charter_charterer }, startDate: c.charter_start, endDate: c.charter_end }] : [],
        vesselAvailabilities: [],
        isOpen: !!c.is_open,
      });

      // If recently enriched, serve from DB cache (no API call)
      if (isFresh) {
        return res.render('vessel-intel/index', { vessel: buildCachedDetail(cachedRows[0]), cached: null, insights: [], voyages: [], lastUpdated, kplerId });
      }

      // Try to fetch live data from API
      let vessel;
      try {
        vessel = await kplerApi.fetchVessel(kplerId);
      } catch (e) {
        // Fallback: use enriched data from DB
        if (!cachedRows.length) [cachedRows] = await db.query('SELECT * FROM kpler_fleet WHERE kpler_id = ?', [kplerId]);
        if (!cachedRows.length) {
          req.flash('error', 'Vessel not found');
          return res.redirect(req.headers.referer || '/kpler-vessels');
        }
        const c = cachedRows[0];
        if (c.enriched_at || c.controller || c.owner) {
          return res.render('vessel-intel/index', { vessel: buildCachedDetail(c), cached: null, insights: [], voyages: [], lastUpdated, kplerId });
        }
        return res.render('vessel-intel/index', { vessel: null, cached: c, insights: [], voyages: [], lastUpdated, kplerId });
      }

      const insights = analyzeVessel(vessel);

      // Extract structured data
      const pc = vessel.portCallInfo?.lastPortCall;
      const snap = vessel.positionSnapshot || {};
      const pos = snap.position || vessel.lastPosition?.geo || {};
      const zones = pc?.zone?.parentZones || [];
      const customZones = zones.filter(z => z.type === 'custom').map(z => z.name);
      const portName = pc?.zone?.name;
      const country = pc?.zone?.country?.name;
      const players = vessel.players || {};

      const detail = {
        // Identity
        name: vessel.name,
        imo: vessel.imo,
        mmsi: vessel.mmsi,
        callSign: vessel.callSign,
        flag: vessel.flagName,
        status: vessel.status,
        state: vessel.state,
        type: vessel.vesselTypeClass,
        kplerId: vessel.id,
        shipClass: vessel.classification?.shipClass,

        // Build
        builtYear: vessel.build?.buildYear,
        builtMonth: vessel.build?.buildMonth,
        builtCountry: vessel.build?.buildCountry,
        builder: vessel.builder,
        age: vessel.build?.buildYear ? (new Date().getFullYear() - vessel.build.buildYear) : null,

        // Specs
        cbm: vessel.cargoMetrics?.capacity,
        cargoType: vessel.cargoMetrics?.cargoType,
        numTanks: vessel.cargoMetrics?.numberTanks,
        deadweight: vessel.deadWeight,
        grossTonnage: vessel.grossTonnage,
        beam: vessel.beam?.value,
        length: vessel.classification?.vesselTypes?.lpg ? null : null, // from nested
        maxSpeed: vessel.engineMetrics?.maxSpeed,
        horsepower: vessel.engineMetrics?.horsePower,
        isEthylene: vessel.isEthyleneCapable,
        isFloatingStorage: vessel.isFloatingStorage || false,

        // Position (real-time from AIS)
        lat: pos.lat,
        lon: pos.lon,
        speed: snap.speed ?? vessel.lastPosition?.speed,
        heading: snap.heading,
        draught: snap.draught ?? vessel.lastPosition?.draught,
        positionTime: snap.receivedTime || vessel.lastPosition?.receivedTime,
        course: vessel.lastPosition?.course,

        // AIS & Destination (nextDestination can be top-level OR under portCallInfo)
        aisDestination: vessel.lastRawAisSignals?.rawDestination,
        aisEta: vessel.lastRawAisSignals?.eta,
        aisSourceTime: vessel.lastRawAisSignals?.setTime,
        nextDestName: vessel.nextDestination?.zone?.name || vessel.nextDestination?.installation?.name || vessel.portCallInfo?.nextDestination?.zone?.name || vessel.portCallInfo?.nextDestination?.installation?.name,
        nextDestCountry: vessel.nextDestination?.zone?.country?.name || vessel.portCallInfo?.nextDestination?.zone?.country?.name,
        nextDestEta: vessel.nextDestination?.eta || vessel.portCallInfo?.nextDestination?.eta,

        // Current Cargo
        loaded: vessel.lastPosition?.currentCargo?.loaded || false,
        cargoProducts: (vessel.lastPosition?.currentCargo?.products || []).map(p => p.name),
        currentVolume: vessel.lastPosition?.volume,
        currentMass: vessel.lastPosition?.currentCargo ? Math.round(vessel.lastPosition.quantity?.mass || 0) : null,

        // Last Port Call
        portName,
        country,
        zones: customZones,
        vesselAvailability: pc?.vesselAvailability,
        arrival: pc?.estimatedBerthArrival,
        departure: pc?.estimatedBerthDeparture,
        portCallOperation: pc?.operation,
        partialCargo: pc?.partialCargo || false,
        isSTS: pc?.shipToShip || false,
        portCallTags: pc?.tags || [],
        lastPortInstallation: pc?.installation?.name,
        lastPortBerth: pc?.berth?.name,

        // STS Info
        stsPartner: pc?.shipToShipInfo?.vessel?.name,
        stsPartnerType: pc?.shipToShipInfo?.vessel?.vesselType,
        stsPartnerImo: pc?.shipToShipInfo?.vessel?.imo,
        stsVolume: pc?.shipToShipInfo?.flowQuantity ? Math.abs(Math.round(pc.shipToShipInfo.flowQuantity.volume)) : null,

        // Flow (load/discharge at last port)
        flowVolume: pc?.flowQuantity ? Math.round(pc.flowQuantity.volume) : null,
        flowMass: pc?.flowQuantity ? Math.round(Math.abs(pc.flowQuantity.mass)) : null,
        confirmedGrades: (pc?.confirmedGrades || []).map(g => g.name),

        // Players
        owner: players.owners?.[0]?.fullname,
        ownerCountry: players.owners?.[0]?.country,
        operator: players.operators?.[0]?.fullname,
        manager: players.managers?.[0]?.fullname,
        commercialManager: players.commercialManagers?.[0]?.fullname,
        beneficialOwner: players.beneficialOwners?.[0]?.fullname,
        beneficialOwnerCountry: players.beneficialOwners?.[0]?.country,
        builderFull: players.builders?.[0]?.fullname,
        controller: vessel.vesselController?.default?.fullname || pc?.vesselController?.fullname,
        controllerCountry: vessel.vesselController?.default?.country || pc?.vesselController?.country,
        thirdPartyOperator: players.thirdPartyOperators?.[0]?.fullname,

        // Activity
        portCallsMetrics: vessel.portCallsMetrics,
        charterContracts: vessel.charterContracts || [],
        vesselAvailabilities: vessel.vesselAvailabilities || [],

        // Open status
        isOpen: vessel.isOpen,
      };

      // Auto-enrich: save fresh API data back to kpler_vessels
      try {
        await db.query(`UPDATE kpler_vessels SET
          lat = COALESCE(?, lat), lon = COALESCE(?, lon),
          speed = ?, heading = ?, draught = ?,
          state = COALESCE(?, state),
          ais_destination = COALESCE(?, ais_destination),
          ais_eta = ?,
          next_dest_name = COALESCE(?, next_dest_name),
          next_dest_country = COALESCE(?, next_dest_country),
          zone_port = COALESCE(?, zone_port),
          zone_country = COALESCE(?, zone_country),
          position = COALESCE(?, position),
          position_detail = COALESCE(?, position_detail),
          controller = COALESCE(?, controller),
          controller_country = ?,
          owner = COALESCE(?, owner),
          beneficial_owner = ?,
          operator = COALESCE(?, operator),
          commercial_manager = ?,
          manager = ?,
          builder = ?,
          cargo_volume = ?,
          current_volume = ?,
          cargo_products = ?,
          confirmed_grades = ?,
          partial_cargo = ?,
          port_call_operation = ?,
          flow_volume = ?,
          sts_partner = ?,
          sts_volume = ?,
          is_sts = ?,
          vessel_availability = COALESCE(?, vessel_availability),
          last_port = COALESCE(?, last_port),
          last_port_country = COALESCE(?, last_port_country),
          last_port_arrival = COALESCE(?, last_port_arrival),
          last_port_departure = COALESCE(?, last_port_departure),
          built_month = COALESCE(?, built_month),
          built_country = COALESCE(?, built_country),
          gross_tonnage = COALESCE(?, gross_tonnage),
          beam = COALESCE(?, beam),
          ship_class = COALESCE(?, ship_class),
          position_time = COALESCE(?, position_time),
          estimated_berth_departure = COALESCE(?, estimated_berth_departure),
          estimated_berth_arrival = COALESCE(?, estimated_berth_arrival),
          last_port_operation = COALESCE(?, last_port_operation),
          ais_set_time = COALESCE(?, ais_set_time),
          current_mass = ?,
          flow_mass = ?,
          parent_zones = COALESCE(?, parent_zones),
          third_party_operator = COALESCE(?, third_party_operator),
          unloads_this_year = COALESCE(?, unloads_this_year),
          unloaded_ton_this_year = COALESCE(?, unloaded_ton_this_year),
          hire_rate = COALESCE(?, hire_rate),
          charter_charterer = ?,
          charter_start = ?,
          charter_end = ?,
          owner_country = COALESCE(?, owner_country),
          course = COALESCE(?, course),
          is_floating_storage = ?,
          last_port_installation = COALESCE(?, last_port_installation),
          last_port_berth = COALESCE(?, last_port_berth),
          enriched_at = NOW()
        WHERE kpler_id = ?`, [
          detail.lat, detail.lon,
          detail.speed, detail.heading, detail.draught,
          detail.state,
          detail.aisDestination,
          detail.aisEta ? new Date(detail.aisEta) : null,
          detail.nextDestName, detail.nextDestCountry,
          portName, country,
          customZones[0] || null, customZones.join(', ') || null,
          detail.controller, detail.controllerCountry || null,
          detail.owner, detail.beneficialOwner || null,
          detail.operator, detail.commercialManager || null,
          detail.manager || null, detail.builderFull || null,
          detail.currentVolume || null, detail.currentVolume || null,
          detail.cargoProducts.length ? detail.cargoProducts.join(', ') : null,
          detail.confirmedGrades?.length ? detail.confirmedGrades.join(', ') : null,
          detail.partialCargo ? 1 : 0,
          detail.portCallOperation || null,
          detail.flowVolume || null,
          detail.stsPartner || null,
          detail.stsVolume || null,
          detail.isSTS ? 1 : 0,
          detail.vesselAvailability || null,
          portName, country,
          detail.arrival ? new Date(detail.arrival) : null,
          detail.departure ? new Date(detail.departure) : null,
          detail.builtMonth || null, detail.builtCountry || null,
          detail.grossTonnage || null, detail.beam || null,
          detail.shipClass || null,
          detail.positionTime ? new Date(detail.positionTime) : null,
          detail.departure ? new Date(detail.departure) : null,
          detail.arrival ? new Date(detail.arrival) : null,
          detail.portCallOperation || null,
          // New fields
          detail.aisSourceTime ? new Date(detail.aisSourceTime) : null,
          detail.currentMass || null,
          detail.flowMass || null,
          customZones.join(', ') || null,
          detail.thirdPartyOperator || null,
          detail.portCallsMetrics?.unloads || null,
          detail.portCallsMetrics?.unloadedThisYearInTon || null,
          detail.portCallsMetrics?.hireRate || null,
          detail.charterContracts?.[0]?.charterer?.name || null,
          detail.charterContracts?.[0]?.startDate ? new Date(detail.charterContracts[0].startDate) : null,
          detail.charterContracts?.[0]?.endDate ? new Date(detail.charterContracts[0].endDate) : null,
          detail.ownerCountry || null,
          detail.course || null,
          detail.isFloatingStorage ? 1 : 0,
          detail.lastPortInstallation || null,
          detail.lastPortBerth || null,
          kplerId
        ]);
      } catch (e) { console.error('Auto-enrich kpler_vessels save error:', e.message); }

      // Also save key fields to kpler_fleet (fleet list reads from this table)
      try {
        await db.query(`UPDATE kpler_fleet SET
          state = COALESCE(?, state),
          controller = COALESCE(?, controller),
          lat = COALESCE(?, lat), lon = COALESCE(?, lon),
          speed = COALESCE(?, speed), draught = COALESCE(?, draught), course = COALESCE(?, course),
          heading = COALESCE(?, heading), position_time = COALESCE(?, position_time),
          ais_destination = COALESCE(?, ais_destination), ais_eta = COALESCE(?, ais_eta),
          next_dest_zone = COALESCE(?, next_dest_zone),
          next_dest_installation = COALESCE(?, next_dest_installation),
          next_dest_eta = COALESCE(?, next_dest_eta),
          last_port = COALESCE(?, last_port),
          last_port_zone = COALESCE(?, last_port_zone),
          last_port_country = COALESCE(?, last_port_country),
          cargo_products = COALESCE(?, cargo_products),
          is_open = ?,
          synced_at = NOW()
        WHERE kpler_id = ?`, [
          detail.state,
          detail.controller,
          detail.lat, detail.lon,
          detail.speed, detail.draught, detail.course,
          detail.heading, detail.positionTime ? new Date(detail.positionTime) : null,
          detail.aisDestination, detail.aisEta ? new Date(detail.aisEta) : null,
          detail.nextDestName, detail.nextDestName,
          detail.nextDestEta ? new Date(detail.nextDestEta) : null,
          detail.lastPortInstallation || portName,
          portName, country,
          detail.cargoProducts.length ? detail.cargoProducts.join(', ') : null,
          detail.isOpen ? 1 : 0,
          kplerId
        ]);
      } catch (e) { console.error('Auto-enrich kpler_fleet save error:', e.message); }

      // Fetch voyages (past + forecast) via GraphQL
      let voyages = [];
      try {
        voyages = await kplerApi.fetchVoyages(kplerId);
        
        // Save nearest forecasted load date
        const now = new Date();
        const forecastLoads = voyages
          .filter(v => v.portCalls?.some(pc => pc.forecasted && pc.operation === 'LOAD'))
          .map(v => {
            const loadPC = v.portCalls.find(pc => pc.operation === 'LOAD');
            return { date: loadPC?.eta || v.start, zone: loadPC?.zone?.name };
          })
          .filter(f => f.date && new Date(f.date) > now)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (forecastLoads.length) {
          const next = forecastLoads[0];
          await db.query(
            'UPDATE kpler_vessels SET next_forecast_load = ?, next_forecast_load_zone = ? WHERE kpler_id = ?',
            [new Date(next.date), next.zone || null, kplerId]
          );
        }
      } catch (e) { console.error('Voyages fetch error:', e.message); }

      res.render('vessel-intel/index', { vessel: detail, cached: null, insights, voyages, lastUpdated: new Date(), kplerId });
    } catch (err) {
      console.error('Vessel intel error:', err);
      req.flash('error', 'Failed to load vessel data');
      res.redirect('/kpler');
    }
  }
};

module.exports = vesselAnalysisController;
