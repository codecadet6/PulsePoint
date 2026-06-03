// Establish Socket connection
const dashSocket = io();

// Map and Marker State
let map;
let emergencyMarkers = {};
let responderMarkers = {};
let activeIncidentsList = {};

// Hardcoded mock hospital locations in Manhattan
const hospitals = [
  { name: "Lenox Hill Hospital", lat: 40.7702, lng: -73.9612 },
  { name: "Mount Sinai Hospital", lat: 40.7901, lng: -73.9530 }
];
let hospitalMarkers = [];

// Initialize Map
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupSocketListeners();
});

function initMap() {
  // Center around Central Park, zoom level 14
  map = L.map('leaflet-map', {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([40.7812, -73.9665], 14);

  // Standard OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // Plot Hospitals
  hospitals.forEach(hosp => {
    const hospIcon = L.divIcon({
      html: `<div style="color: #10b981; font-size: 1.2rem; filter: drop-shadow(0 0 4px rgba(16,185,129,0.5));">
               <i class="fa-solid fa-square-h"></i>
             </div>`,
      className: 'custom-map-icon',
      iconSize: [20, 20]
    });

    const marker = L.marker([hosp.lat, hosp.lng], { icon: hospIcon })
      .addTo(map)
      .bindPopup(`<strong>${hosp.name}</strong><br>Medical Station Standby`);
    
    hospitalMarkers.push(marker);
  });
}

// Custom Icons Generators
function getVictimIcon() {
  return L.divIcon({
    html: `<div style="position: relative; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
             <div class="victim-pulse-ring"></div>
             <div style="color: #f43f5e; font-size: 1.3rem; z-index: 2;"><i class="fa-solid fa-person-circle-exclamation"></i></div>
           </div>`,
    className: 'custom-map-icon',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function getResponderIcon(type) {
  const color = type === 'Ambulance' ? '#3b82f6' : '#f59e0b';
  const icon = type === 'Ambulance' ? 'fa-truck-medical' : 'fa-motorcycle';
  return L.divIcon({
    html: `<div style="color: ${color}; font-size: 1.2rem; filter: drop-shadow(0 0 6px ${color}); animation: pulse 1s infinite alternate;">
             <i class="fa-solid ${icon}"></i>
           </div>`,
    className: 'custom-map-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

// Synthesis audio buzzer tone
function playEmergencyAlertTone() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Play double beep
    for (let i = 0; i < 2; i++) {
      const timeOffset = i * 0.25;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime + timeOffset);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime + timeOffset);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + timeOffset + 0.18);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(audioCtx.currentTime + timeOffset);
      osc.stop(audioCtx.currentTime + timeOffset + 0.2);
    }
  } catch (err) {
    console.log("Audio notification blocked by browser autoplay policy.");
  }
}

// Socket Bindings
function setupSocketListeners() {
  // Load existing data on load
  dashSocket.on('initial-state', (data) => {
    // Clear previous markers to prevent duplicates
    Object.keys(emergencyMarkers).forEach(id => {
      map.removeLayer(emergencyMarkers[id]);
    });
    emergencyMarkers = {};

    Object.keys(responderMarkers).forEach(id => {
      map.removeLayer(responderMarkers[id]);
    });
    responderMarkers = {};

    activeIncidentsList = {};
    resetResponderListStandby();
    
    data.emergencies.forEach(emergency => {
      activeIncidentsList[emergency.id] = emergency;
      addEmergencyMarker(emergency);
    });

    data.responders.forEach(responder => {
      addResponderMarker(responder);
      setResponderListDispatched(responder.name);
    });

    updateIncidentTable();
    updateHeaderStats();
  });

  // Receive Live Console Logs from Backend API Simulation
  dashSocket.on('api-log', (log) => {
    appendConsoleLog(log);
  });

  // Receive New SOS
  dashSocket.on('new-emergency', (emergency) => {
    activeIncidentsList[emergency.id] = emergency;
    addEmergencyMarker(emergency);
    updateIncidentTable();
    updateHeaderStats();
    playEmergencyAlertTone();

    // Pan map to victim
    map.flyTo([emergency.lat, emergency.lng], 15, { animate: true, duration: 1.5 });
  });

  // Location updating
  dashSocket.on('emergency-location-updated', (data) => {
    if (activeIncidentsList[data.id]) {
      activeIncidentsList[data.id].lat = data.lat;
      activeIncidentsList[data.id].lng = data.lng;
    }
    if (emergencyMarkers[data.id]) {
      emergencyMarkers[data.id].setLatLng([data.lat, data.lng]);
    }
    updateIncidentTable();
  });

  // Responder dispatch mapping updates
  dashSocket.on('responder-dispatched', (data) => {
    const { emergency, responder } = data;
    
    // Update local state
    if (activeIncidentsList[emergency.id]) {
      activeIncidentsList[emergency.id].status = emergency.status;
    }
    
    // Update responder representation
    addResponderMarker(responder);
    
    updateIncidentTable();
    updateHeaderStats();
    
    // Update visual responder list state
    setResponderListDispatched(responder.name);
  });

  // Responder travelling coordinates
  dashSocket.on('responder-location-updated', (responder) => {
    if (responderMarkers[responder.id]) {
      responderMarkers[responder.id].setLatLng([responder.lat, responder.lng]);
      
      // Update popup content with dynamic ETA
      let text = `<strong>${responder.name}</strong><br>Status: En Route<br>ETA: ${responder.eta}`;
      if (responder.eta === 'ARRIVED') {
        text = `<strong>${responder.name}</strong><br>Status: Arrived at Victim`;
        
        // Update local emergency status to ARRIVED
        if (activeIncidentsList[responder.emergencyId]) {
          activeIncidentsList[responder.emergencyId].status = 'ARRIVED';
          updateIncidentTable();
        }
      }
      responderMarkers[responder.id].getPopup().setContent(text);
    }
  });

  // Incident cleanup
  dashSocket.on('emergency-resolved', (data) => {
    const { emergencyId, respId } = data;
    
    // Remove markers
    if (emergencyMarkers[emergencyId]) {
      map.removeLayer(emergencyMarkers[emergencyId]);
      delete emergencyMarkers[emergencyId];
    }
    if (responderMarkers[respId]) {
      map.removeLayer(responderMarkers[respId]);
      delete responderMarkers[respId];
    }

    delete activeIncidentsList[emergencyId];

    updateIncidentTable();
    updateHeaderStats();
    
    // Refresh the responder standby state visually if all emergencies are resolved
    if (Object.keys(activeIncidentsList).length === 0) {
      resetResponderListStandby();
    } else {
      // Find what responders are still active for remaining emergencies
      resetResponderListStandby();
      dashSocket.emit('request-state-update'); // Request clean sync from server
    }
  });

  dashSocket.on('responder-removed', (data) => {
    if (responderMarkers[data.id]) {
      map.removeLayer(responderMarkers[data.id]);
      delete responderMarkers[data.id];
    }
  });
}

// Marker Helpers
function addEmergencyMarker(emergency) {
  if (emergencyMarkers[emergency.id]) return;

  const marker = L.marker([emergency.lat, emergency.lng], { icon: getVictimIcon() })
    .addTo(map)
    .bindPopup(`<h4>${emergency.name}</h4>
               <p><strong>Trigger:</strong> ${emergency.triggerType}</p>
               <p><strong>Phone:</strong> ${emergency.phone}</p>`);
  
  emergencyMarkers[emergency.id] = marker;
}

function addResponderMarker(responder) {
  if (responderMarkers[responder.id]) return;

  const marker = L.marker([responder.lat, responder.lng], { icon: getResponderIcon(responder.type) })
    .addTo(map)
    .bindPopup(`<strong>${responder.name}</strong><br>Status: En Route<br>ETA: ${responder.eta}`);
  
  responderMarkers[responder.id] = marker;
}

// Render Incidents Table Reactively
function updateIncidentTable() {
  const tbody = document.getElementById('incidents-table-body');
  if (!tbody) return;

  const incidents = Object.values(activeIncidentsList);

  if (incidents.length === 0) {
    tbody.innerHTML = `<tr class="empty-row">
                         <td colspan="5">No active emergencies. Waiting for SOS...</td>
                       </tr>`;
    return;
  }

  tbody.innerHTML = '';
  incidents.forEach(inc => {
    const tr = document.createElement('tr');
    tr.className = inc.status !== 'PENDING' ? '' : 'active-incident-row';

    // Status classes
    let statusClass = 'status-pending';
    if (inc.status === 'DISPATCHED') statusClass = 'status-dispatched';
    if (inc.status === 'ARRIVED') statusClass = 'status-arrived';

    // Lat/Lng text
    const latlngText = `${inc.lat.toFixed(4)}, ${inc.lng.toFixed(4)}`;

    // Dispatch buttons logic
    let actionButtons = '';
    if (inc.status === 'PENDING') {
      actionButtons = `
        <div class="dispatch-actions">
          <button class="btn-table-action ambulance" onclick="dispatchResponder('${inc.id}', 'Ambulance')">
            <i class="fa-solid fa-truck-medical"></i> Dispatch Amb
          </button>
          <button class="btn-table-action volunteer" onclick="dispatchResponder('${inc.id}', 'Volunteer')">
            <i class="fa-solid fa-motorcycle"></i> Dispatch Vol
          </button>
        </div>
      `;
    } else {
      actionButtons = `
        <button class="btn-table-action resolve" onclick="resolveEmergency('${inc.id}')">
          <i class="fa-solid fa-check"></i> Resolve / Close
        </button>
      `;
    }

    tr.innerHTML = `
      <td><strong>${inc.name}</strong><br><span style="font-size:0.65rem; color:#94a3b8">${inc.phone}</span></td>
      <td><span class="badge-small">${inc.triggerType}</span></td>
      <td><span class="incident-badge-status ${statusClass}">${inc.status}</span></td>
      <td class="font-mono">${latlngText}</td>
      <td>${actionButtons}</td>
    `;

    tbody.appendChild(tr);
  });
}

// Controller Emitters bound to clicks
window.dispatchResponder = function(emergencyId, type) {
  dashSocket.emit('dispatch-responder', { emergencyId, responderType: type });
};

window.resolveEmergency = function(emergencyId) {
  dashSocket.emit('resolve-emergency', { emergencyId });
};

// Standby Responder Network list updater
function setResponderListDispatched(responderName) {
  const cards = document.querySelectorAll('.responder-card');
  cards.forEach(card => {
    const nameEl = card.querySelector('strong');
    if (nameEl && nameEl.innerText === responderName) {
      card.classList.add('dispatched-active');
      const badge = card.querySelector('.status-badge');
      if (badge) {
        badge.innerText = 'RESPONDING';
        badge.className = 'status-badge badge-responding';
      }
    }
  });
}

function resetResponderListStandby() {
  const cards = document.querySelectorAll('.responder-card');
  cards.forEach(card => {
    card.classList.remove('dispatched-active');
    const badge = card.querySelector('.status-badge');
    if (badge) {
      badge.innerText = 'STANDBY';
      badge.className = 'status-badge badge-standby';
    }
  });
}

// Header Stats display updater
function updateHeaderStats() {
  const activeCount = Object.keys(activeIncidentsList).length;
  document.getElementById('active-emergencies-count').innerText = activeCount;

  let dispatched = 0;
  Object.values(activeIncidentsList).forEach(inc => {
    if (inc.status === 'DISPATCHED' || inc.status === 'ARRIVED') {
      dispatched++;
    }
  });
  document.getElementById('dispatched-count').innerText = dispatched;
}

// Console Logging Window Appender
function appendConsoleLog(log) {
  const consoleBox = document.getElementById('console-logs');
  if (!consoleBox) return;

  const logDiv = document.createElement('div');
  
  // Choose class based on log type
  let typeClass = 'log-system';
  if (log.type === 'TWILIO') typeClass = 'log-twilio';
  if (log.type === 'GOOGLE_MAPS') typeClass = 'log-maps';
  if (log.type === 'DATABASE') typeClass = 'log-db';

  logDiv.className = `log-row ${typeClass}`;
  logDiv.innerHTML = `
    <span class="log-time">${log.timestamp}</span>
    <span class="log-tag">${log.type}</span>
    <span class="log-message"><strong>${log.action}:</strong> ${log.details}</span>
  `;

  consoleBox.appendChild(logDiv);

  // Auto scroll to bottom
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

window.clearConsole = function() {
  const consoleBox = document.getElementById('console-logs');
  if (consoleBox) {
    consoleBox.innerHTML = '';
  }
};
