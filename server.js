require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const twilio = require('twilio');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Set up page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/victim', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'victim.html'));
});

app.get('/dispatcher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dispatcher.html'));
});

// Helper to generate simulated coordinates around a center point
function getRandomOffset(maxDistanceKm) {
  const latOffset = (Math.random() - 0.5) * (maxDistanceKm / 111);
  const lonOffset = (Math.random() - 0.5) * (maxDistanceKm / 85); // assume lat ~40
  return { latOffset, lonOffset };
}

// Log simulation helper that stores logs in SQLite and broadcasts to dashboards
async function emitApiLog(io, type, action, details) {
  const logEntry = await db.logApiEvent(type, action, details);
  console.log(`[${logEntry.type}] ${logEntry.action}:`, details);
  io.emit('api-log', logEntry);
}

// Initialize Twilio Client if config is available
const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFrom = process.env.TWILIO_FROM_NUMBER;
const testIcePhone = process.env.ICE_PHONE_NUMBER;

let twilioClient = null;
if (twilioSid && twilioAuthToken && twilioFrom) {
  try {
    twilioClient = twilio(twilioSid, twilioAuthToken);
    console.log('Twilio API Client initialized successfully (Production Mode).');
  } catch (err) {
    console.error('Failed to initialize Twilio client:', err.message);
  }
} else {
  console.log('Twilio credentials missing. Running in Simulated SMS mode.');
}

// Google Maps Reverse Geocoding Helper
async function reverseGeocode(lat, lng) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
    } catch (err) {
      console.error('Google Maps API reverse geocoding failed:', err.message);
    }
  }
  return 'Near Central Park, Sector 4, New York, NY';
}

io.on('connection', async (socket) => {
  console.log(`New socket connection: ${socket.id}`);

  // Fetch current states from database
  try {
    const emergencies = await db.getEmergencies();
    const responders = await db.getResponders();
    socket.emit('initial-state', {
      emergencies,
      responders
    });

    // Feed latest logs
    const logs = await db.getApiLogs(30);
    // Send logs oldest first to display in correct chronological order
    logs.reverse().forEach(log => {
      socket.emit('api-log', log);
    });
  } catch (err) {
    console.error('Error fetching initial state from database:', err);
  }

  // Victim registers
  socket.on('register-victim', async (data) => {
    socket.join('victims');
    await emitApiLog(io, 'SYSTEM', 'Victim Device Registered', `Device ID: ${socket.id}, User: ${data.name || 'Anonymous'}`);
  });

  // Trigger SOS (manual or sensor-activated)
  socket.on('trigger-sos', async (data) => {
    const emergencyId = socket.id; // Unique per active victim connection
    const timestamp = new Date().toISOString();
    
    const emergency = {
      id: emergencyId,
      name: data.name || 'Unknown User',
      phone: data.phone || '+1 (555) 019-2834',
      lat: data.lat || 40.7128,
      lng: data.lng || -74.0060,
      triggerType: data.triggerType || 'MANUAL', // MANUAL, FALL_DETECTION, CRASH_IMPACT
      status: 'PENDING',
      timestamp: timestamp,
      firstAidTip: data.firstAidTip || 'Keep calm. Stay in a safe position. Help is on the way.'
    };

    try {
      await db.saveEmergency(emergency);
      await emitApiLog(io, 'DATABASE', 'Emergency Record Created', `ID: ${emergencyId}, Status: PENDING, Type: ${emergency.triggerType}`);
      
      // Broadcast new emergency to dashboards
      io.emit('new-emergency', emergency);

      // Handle Twilio SMS Dispatch
      const smsMessage = `ALERT: PulsePoint+ detected an emergency (${emergency.triggerType}) for ${emergency.name}. Live Location: https://maps.google.com/?q=${emergency.lat},${emergency.lng}`;
      
      const targetPhone = testIcePhone || emergency.phone;
      await emitApiLog(io, 'TWILIO', 'SMS Dispatch Request', `To: ${targetPhone}. Msg: "${smsMessage}"`);

      if (twilioClient) {
        twilioClient.messages.create({
          body: smsMessage,
          to: targetPhone,
          from: twilioFrom
        }).then(async (message) => {
          await emitApiLog(io, 'TWILIO', 'Real SMS Sent Successfully', `SID: ${message.sid}, To: ${targetPhone}`);
        }).catch(async (err) => {
          await emitApiLog(io, 'TWILIO', 'Real SMS Dispatch Failed', `Error: ${err.message}`);
        });
      } else {
        setTimeout(async () => {
          await emitApiLog(io, 'TWILIO', 'SMS Sent Successfully (Simulated)', `Status: 200 OK, MessageSid: SM${Math.random().toString(36).substring(2, 12).toUpperCase()}`);
        }, 1200);
      }

      // Handle Google Maps Reverse Geocoding
      await emitApiLog(io, 'GOOGLE_MAPS', 'Reverse Geocoding Request', `Coordinates: ${emergency.lat}, ${emergency.lng}`);
      const resolvedAddress = await reverseGeocode(emergency.lat, emergency.lng);
      await emitApiLog(io, 'GOOGLE_MAPS', 'Geocoding Response', `Resolved Address: ${resolvedAddress}`);

    } catch (err) {
      console.error('Error handling SOS trigger:', err);
    }
  });

  // Victim live coordinates update (e.g. GPS drifting or walking)
  socket.on('update-location', async (data) => {
    const emergencyId = socket.id;
    try {
      const emergency = await db.getEmergency(emergencyId);
      if (emergency) {
        emergency.lat = data.lat;
        emergency.lng = data.lng;
        await db.saveEmergency(emergency);
        
        io.emit('emergency-location-updated', { id: emergencyId, lat: data.lat, lng: data.lng });
        await emitApiLog(io, 'GOOGLE_MAPS', 'Location Stream Update', `Victim ID ${emergencyId} updated position to: ${data.lat}, ${data.lng}`);
      }
    } catch (err) {
      console.error('Error updating location:', err);
    }
  });

  // Dashboard dispatches responder
  socket.on('dispatch-responder', async (data) => {
    const { emergencyId, responderType } = data;
    
    try {
      const emergency = await db.getEmergency(emergencyId);
      if (!emergency) {
        socket.emit('error', { message: 'Emergency not found or already resolved.' });
        return;
      }

      emergency.status = 'DISPATCHED';
      await db.saveEmergency(emergency);
      await emitApiLog(io, 'DATABASE', 'Emergency Record Updated', `ID: ${emergencyId}, Status: DISPATCHED`);
      
      const offsets = getRandomOffset(1.2);
      const responderStartLat = emergency.lat + offsets.latOffset;
      const responderStartLng = emergency.lng + offsets.lonOffset;

      const responder = {
        id: `resp_${emergencyId}`,
        emergencyId: emergencyId,
        type: responderType,
        name: responderType === 'Ambulance' ? 'Ambulance 104' : 'Volunteer Sarah Kent',
        lat: responderStartLat,
        lng: responderStartLng,
        eta: '4 mins'
      };

      await db.saveResponder(responder);

      // Send dispatch confirmation
      io.emit('responder-dispatched', { emergency, responder });

      await emitApiLog(io, 'GOOGLE_MAPS', 'Direction Route Request', `Origin: ${responderStartLat},${responderStartLng} -> Destination: ${emergency.lat},${emergency.lng}`);
      
      const responderSms = `PulsePoint+ Dispatch: You have been assigned to assist ${emergency.name}. Head to: https://maps.google.com/?q=${emergency.lat},${emergency.lng}`;
      await emitApiLog(io, 'TWILIO', 'SMS Dispatch Instruction Sent', `To: Responder ${responder.name}. Msg: "${responderSms}"`);

      // Simulate Responder Movement (Step-by-step travel)
      let steps = 10;
      let currentStep = 0;
      const intervalId = setInterval(async () => {
        currentStep++;
        
        try {
          // Check if emergency was resolved or canceled
          const activeEmergency = await db.getEmergency(emergencyId);
          if (!activeEmergency) {
            clearInterval(intervalId);
            await db.deleteResponder(responder.id);
            io.emit('responder-removed', { id: responder.id });
            return;
          }

          const ratio = currentStep / steps;
          responder.lat = responderStartLat + (activeEmergency.lat - responderStartLat) * ratio;
          responder.lng = responderStartLng + (activeEmergency.lng - responderStartLng) * ratio;
          responder.eta = `${Math.ceil((steps - currentStep) * 0.5)} mins`;

          if (currentStep >= steps) {
            clearInterval(intervalId);
            responder.eta = 'ARRIVED';
            activeEmergency.status = 'ARRIVED';
            await db.saveEmergency(activeEmergency);
            await db.saveResponder(responder);
            
            await emitApiLog(io, 'DATABASE', 'Emergency Status Updated', `ID: ${emergencyId}, Status: ARRIVED`);
            await emitApiLog(io, 'SYSTEM', 'Responder Arrived', `${responder.name} has arrived at the scene.`);
            await emitApiLog(io, 'TWILIO', 'SMS Alert', `To: ICE Contacts. Msg: "Responder ${responder.name} has arrived at ${activeEmergency.name}'s location."`);
          } else {
            await db.saveResponder(responder);
          }

          io.emit('responder-location-updated', responder);
        } catch (err) {
          clearInterval(intervalId);
          console.error('Error during responder movement simulation:', err);
        }
      }, 2000);

    } catch (err) {
      console.error('Error dispatching responder:', err);
    }
  });

  // Resolve Emergency
  socket.on('resolve-emergency', async (data) => {
    const { emergencyId } = data;
    try {
      const emergency = await db.getEmergency(emergencyId);
      if (emergency) {
        await db.deleteEmergency(emergencyId);
        await db.deleteRespondersForEmergency(emergencyId);
        
        const respId = `resp_${emergencyId}`;
        io.emit('emergency-resolved', { emergencyId, respId });
        
        await emitApiLog(io, 'DATABASE', 'Emergency Record Closed', `ID: ${emergencyId}, Resolved Successfully`);
        await emitApiLog(io, 'SYSTEM', 'Emergency Cleared', `Incident for ${emergency.name} has been resolved.`);
      }
    } catch (err) {
      console.error('Error resolving emergency:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Initialize database then start server
db.dbInit()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`PulsePoint+ server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
