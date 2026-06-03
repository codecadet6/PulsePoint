// Establish Socket connection
const socket = io();

// User state variables
let userProfile = {
  name: 'Alex Mercer',
  phone: '+1 (555) 389-1029',
  contact: 'Sarah Mercer (Wife) - +1 (555) 723-9081',
  language: 'en-US',
  soundEnabled: true
};

// Base coordinates (Central Park area)
let baseCoords = { lat: 40.7812, lng: -73.9665 };
let currentCoords = { ...baseCoords };

let countdownInterval = null;
let countdownVal = 5;
let isSosTriggered = false;

// Audio messages structure
const speechMessages = {
  'en-US': {
    fallDetected: "A fall has been detected. Triggering emergency SOS in 5 seconds. Tap to cancel if you are okay.",
    crashDetected: "Car crash impact detected. Emergency SOS triggered immediately.",
    sosTriggered: "Emergency SOS triggered. Nearby responders and family have been notified. Stay where you are.",
    responderDispatched: "First responders have been dispatched to your location. Expected time of arrival is four minutes.",
    responderArrived: "Responder has arrived at your location.",
    resolved: "Emergency resolved. Returning to normal standby mode."
  },
  'es-ES': {
    fallDetected: "Se ha detectado una caída. Activando SOS de emergencia en 5 segundos. Presione para cancelar si está bien.",
    crashDetected: "Impacto de choque detectado. SOS de emergencia activado de inmediato.",
    sosTriggered: "SOS de emergencia activado. Los socorristas y la familia han sido notificados. Quédese donde está.",
    responderDispatched: "Se han enviado socorristas a su ubicación. El tiempo estimado de llegada es de cuatro minutos.",
    responderArrived: "El equipo de rescate ha llegado a su ubicación.",
    resolved: "Emergencia resuelta. Volviendo al modo de espera normal."
  },
  'hi-IN': {
    fallDetected: "गिरावट का पता चला है। 5 सेकंड में आपातकालीन एसओएस शुरू हो जाएगा। यदि आप ठीक हैं तो रद्द करने के लिए टैप करें।",
    crashDetected: "कार दुर्घटना का पता चला। आपातकालीन एसओएस तुरंत सक्रिय हो गया।",
    sosTriggered: "आपातकालीन एसओएस सक्रिय। पास के स्वयंसेवकों और परिवार को सूचित कर दिया गया है। वहीं रहें।",
    responderDispatched: "प्रथम प्रतिक्रियाकर्ता आपकी स्थान पर भेज दिए गए हैं। चार मिनट में पहुँच रहे हैं।",
    responderArrived: "सहायता टीम आपके स्थान पर पहुँच चुकी है।",
    resolved: "आपातकाल समाप्त। सामान्य मोड में वापस जा रहे हैं।"
  },
  'fr-FR': {
    fallDetected: "Une chute a été détectée. SOS d'urgence automatique dans 5 secondes. Appuyez pour annuler.",
    crashDetected: "Impact de collision détecté. SOS d'urgence déclenché immédiatement.",
    sosTriggered: "SOS d'urgence activé. Les secours et votre famille ont été alertés. Restez sur place.",
    responderDispatched: "Les secours ont été envoyés vers votre position. Arrivée estimée dans 4 minutes.",
    responderArrived: "Les secours sont arrivés sur les lieux.",
    resolved: "Urgence résolue. Retour au mode de veille standard."
  }
};

// First aid advice list for rotation
const firstAidTips = [
  "Sit or lie down in a safe spot. Do not attempt to walk if you feel dizzy or hurt.",
  "Check yourself for bleeding. Apply firm, direct pressure to any wounds with a clean cloth.",
  "Keep warm. If in shock, lie flat and elevate your legs slightly if it does not cause pain.",
  "If a limb looks broken, do not move it. Support it with folded clothes or soft objects.",
  "Maintain regular slow breaths. Rescue dispatchers are tracking your location continuously."
];
let tipIndex = 0;
let tipInterval = null;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  setupUIEventListeners();
  
  // Set initial coordinates text
  updateCoordinateDisplay();
  
  // Generate random base coordinates slightly offset each run so it feels organic
  baseCoords.lat += (Math.random() - 0.5) * 0.005;
  baseCoords.lng += (Math.random() - 0.5) * 0.005;
  currentCoords = { ...baseCoords };

  // Load profile from localStorage if exists
  const saved = localStorage.getItem('pulsepoint_profile');
  if (saved) {
    try {
      userProfile = JSON.parse(saved);
      // Pre-fill form fields
      document.getElementById('user-name').value = userProfile.name;
      document.getElementById('user-phone').value = userProfile.phone;
      document.getElementById('emergency-contact').value = userProfile.contact;
      document.getElementById('voice-language').value = userProfile.language;
      document.getElementById('sound-enabled').checked = userProfile.soundEnabled;

      document.getElementById('display-user-name').innerText = userProfile.name.split(' ')[0];
      switchView('screen-home');
      
      // Delay socket register a tiny bit for connection readiness
      setTimeout(() => {
        socket.emit('register-victim', { name: userProfile.name, phone: userProfile.phone });
      }, 500);
    } catch(e) {
      console.error('Error loading saved profile:', e);
    }
  }
});

function setupUIEventListeners() {
  // SOS Button trigger
  const sosBtn = document.getElementById('sos-trigger-btn');
  if (sosBtn) {
    sosBtn.addEventListener('click', () => {
      triggerEmergency('MANUAL');
    });
  }

  // Fall Simulation
  const fallBtn = document.getElementById('sim-fall-btn');
  if (fallBtn) {
    fallBtn.addEventListener('click', startFallCountdown);
  }

  // Crash Simulation
  const crashBtn = document.getElementById('sim-crash-btn');
  if (crashBtn) {
    crashBtn.addEventListener('click', () => {
      triggerEmergency('CRASH_IMPACT');
    });
  }

  // Cancel Countdown
  const cancelCountdownBtn = document.getElementById('cancel-countdown-btn');
  if (cancelCountdownBtn) {
    cancelCountdownBtn.addEventListener('click', cancelFallCountdown);
  }

  // Cancel Active SOS
  const cancelSosBtn = document.getElementById('cancel-sos-btn');
  if (cancelSosBtn) {
    cancelSosBtn.addEventListener('click', () => {
      socket.emit('resolve-emergency', { emergencyId: socket.id });
    });
  }

  // GPS Slider Simulator
  const gpsSlider = document.getElementById('gps-drift-slider');
  const gpsDisplayVal = document.getElementById('gps-drift-val');
  if (gpsSlider) {
    gpsSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      gpsDisplayVal.innerText = `${val * 10}m`;
      
      // Calculate new coords with offset
      // Approx 0.00009 degrees = 10 meters
      currentCoords.lat = baseCoords.lat + (val * 0.00009);
      currentCoords.lng = baseCoords.lng + (val * 0.00009);
      
      updateCoordinateDisplay();
      
      if (isSosTriggered) {
        socket.emit('update-location', {
          lat: currentCoords.lat,
          lng: currentCoords.lng
        });
      }
    });
  }
}

function updateCoordinateDisplay() {
  const coordText = `${currentCoords.lat.toFixed(5)}, ${currentCoords.lng.toFixed(5)}`;
  const myCoordsDiv = document.getElementById('my-coords');
  if (myCoordsDiv) {
    myCoordsDiv.innerText = coordText;
  }
}

// Profile Save Setup
window.saveProfile = function() {
  userProfile.name = document.getElementById('user-name').value;
  userProfile.phone = document.getElementById('user-phone').value;
  userProfile.contact = document.getElementById('emergency-contact').value;
  userProfile.language = document.getElementById('voice-language').value;
  userProfile.soundEnabled = document.getElementById('sound-enabled').checked;

  localStorage.setItem('pulsepoint_profile', JSON.stringify(userProfile));

  document.getElementById('display-user-name').innerText = userProfile.name.split(' ')[0];
  
  // Transition to Home Screen
  switchView('screen-home');
  
  // Register with Socket Server
  socket.emit('register-victim', { name: userProfile.name, phone: userProfile.phone });
};

function switchView(viewId) {
  const views = document.querySelectorAll('.screen-view');
  views.forEach(view => view.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
}

// Text to speech voice announcer
function speakMessage(key) {
  if (!userProfile.soundEnabled) return;
  
  // Clean up any ongoing speech
  window.speechSynthesis.cancel();
  
  const text = speechMessages[userProfile.language][key];
  if (!text) return;
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = userProfile.language;
  
  // Try to find matching voice on system
  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = voices.find(v => v.lang.startsWith(userProfile.language.substring(0, 2)));
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }
  
  window.speechSynthesis.speak(utterance);
}

// Fall Countdown Mechanism
function startFallCountdown() {
  switchView('screen-countdown');
  countdownVal = 5;
  document.getElementById('countdown-number').innerText = countdownVal;
  
  speakMessage('fallDetected');
  
  countdownInterval = setInterval(() => {
    countdownVal--;
    document.getElementById('countdown-number').innerText = countdownVal;
    
    if (countdownVal <= 0) {
      clearInterval(countdownInterval);
      triggerEmergency('FALL_DETECTION');
    }
  }, 1000);
}

function cancelFallCountdown() {
  clearInterval(countdownInterval);
  window.speechSynthesis.cancel();
  switchView('screen-home');
}

// Trigger Emergency Alert
function triggerEmergency(type) {
  isSosTriggered = true;
  switchView('screen-active-sos');
  
  document.getElementById('victim-trigger-type').innerText = type;
  document.getElementById('victim-status-text').innerText = 'SOS Alert Active';
  document.getElementById('victim-status-subtext').innerText = 'Locating closest responders...';
  
  // Update indicator
  const voiceInd = document.getElementById('voice-guidance-indicator');
  if (voiceInd) {
    voiceInd.innerText = `Active (${userProfile.language.substring(0,2).toUpperCase()})`;
  }
  
  // Trigger speech voice
  if (type === 'CRASH_IMPACT') {
    speakMessage('crashDetected');
  } else {
    speakMessage('sosTriggered');
  }
  
  // Start First Aid Advice Rotation
  startTipRotation();
  
  // Emit to socket server
  socket.emit('trigger-sos', {
    name: userProfile.name,
    phone: userProfile.phone,
    lat: currentCoords.lat,
    lng: currentCoords.lng,
    triggerType: type,
    firstAidTip: firstAidTips[0]
  });
}

function startTipRotation() {
  tipIndex = 0;
  const tipBox = document.getElementById('first-aid-tip-box');
  if (tipBox) {
    tipBox.innerText = firstAidTips[tipIndex];
  }
  
  clearInterval(tipInterval);
  tipInterval = setInterval(() => {
    tipIndex = (tipIndex + 1) % firstAidTips.length;
    if (tipBox) {
      tipBox.classList.add('fade-out');
      setTimeout(() => {
        tipBox.innerText = firstAidTips[tipIndex];
        tipBox.classList.remove('fade-out');
      }, 300);
    }
  }, 8000);
}

// Socket Response Receivers
socket.on('responder-dispatched', (data) => {
  if (data.emergency.id !== socket.id) return;
  
  document.getElementById('victim-status-text').innerText = 'Help Dispatched';
  document.getElementById('victim-status-subtext').innerText = `${data.responder.name} is on the way (ETA: 4m)`;
  
  speakMessage('responderDispatched');
});

socket.on('responder-location-updated', (responder) => {
  if (responder.emergencyId !== socket.id) return;
  
  const statusSubtext = document.getElementById('victim-status-subtext');
  
  if (responder.eta === 'ARRIVED') {
    document.getElementById('victim-status-text').innerText = 'Responder Arrived';
    statusSubtext.innerText = `${responder.name} has arrived at the scene.`;
    speakMessage('responderArrived');
  } else {
    statusSubtext.innerText = `${responder.name} en route (ETA: ${responder.eta})`;
  }
});

socket.on('emergency-resolved', (data) => {
  if (data.emergencyId !== socket.id) return;
  
  isSosTriggered = false;
  clearInterval(tipInterval);
  switchView('screen-home');
  speakMessage('resolved');
});
