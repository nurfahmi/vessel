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
      
      // Try to fetch live data from API
      let vessel;
      try {
        vessel = await kplerApi.fetchVessel(kplerId);
      } catch (e) {
        // Fallback: use cached data from kpler_vessels
        const [rows] = await db.query('SELECT * FROM kpler_vessels WHERE kpler_id = ?', [kplerId]);
        if (!rows.length) {
          req.flash('error', 'Vessel not found');
          return res.redirect('/kpler');
        }
        return res.render('vessel-intel/index', { vessel: null, cached: rows[0], insights: [], voyages: [] });
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
      } catch (e) { console.error('Auto-enrich save error:', e.message); }

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

      res.render('vessel-intel/index', { vessel: detail, cached: null, insights, voyages });
    } catch (err) {
      console.error('Vessel intel error:', err);
      req.flash('error', 'Failed to load vessel data');
      res.redirect('/kpler');
    }
  }
};

module.exports = vesselAnalysisController;
