# 🚑 PulsePoint+ — Smart Emergency Response System

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Socket.IO](https://img.shields.io/badge/Realtime-Socket.IO-black)


---

## 📌 Project Overview

**PulsePoint+** is a real-time emergency response simulation system built using Node.js and WebSockets.

It simulates how a smart city emergency system works where a victim can trigger an SOS alert and the system automatically notifies responders, tracks live location, and manages dispatch in real time.

This project is built for learning full-stack development, real-time communication, and system design concepts.

---

## 🚨 Key Features

### 🆘 Emergency SOS System
- One-click SOS trigger
- Automatic emergency creation
- Sensor-based emergency simulation (fall / crash)

### 📡 Real-Time Communication
- Live updates using Socket.IO
- Instant broadcasting to dispatcher dashboard
- No page refresh required

### 🗺 Live Location Tracking
- Victim location tracking in real time
- Responder movement simulation
- Interactive map-based visualization

### 🚑 Dispatch System
- Assign responders manually from dashboard
- Simulated ambulance movement toward victim
- ETA and status updates

### 📢 Notification System
- Mock Twilio SMS integration
- Emergency alerts sent to contacts
- System logs for every action

### 🧠 Event-Driven Architecture
- Fully event-based backend system
- Real-time state synchronization
- Multi-user role system (victim / dispatcher)

---

## 🛠 Tech Stack

### Backend
- Node.js
- Express.js
- Socket.IO
- SQLite (database)

### Frontend
- HTML
- CSS
- JavaScript
- Leaflet.js (for maps)

### Others
- Twilio (mock/simulated SMS)
- Google Maps API (optional geocoding)

---

## 📂 Project Structure

PulsePoint/
│
├── public/              # Frontend files
│   ├── index.html
│   ├── victim.html
│   ├── dispatcher.html
│   ├── css/
│   └── js/
│
├── server.js            # Main backend server
├── database.js          # SQLite database logic
├── pulsepoint.db        # Local database
├── package.json         # Dependencies
└── .env                 # Environment variables

⚙️ Installation

git clone https://github.com/yourusername/PulsePoint.git
cd PulsePoint
npm install

🔐 Environment Variables

PORT=3000

TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_FROM_NUMBER=+1234567890

ICE_PHONE_NUMBER=+91XXXXXXXXXX
GOOGLE_MAPS_API_KEY=your_api_key

▶️ Running the Project

npm start
Then open:

👤 Victim UI → http://localhost:3000/victim
🧭 Dispatcher → http://localhost:3000/dispatcher
🏠 Main → http://localhost:3000/

📡 System Workflow

Victim triggers SOS
↓
Server receives emergency event
↓
Broadcast to dashboard
↓
Responder assigned
↓
Live tracking starts
↓
Updates sent in real time

🔄 WebSocket Events

| Event                      | Direction           | Description         |
| -------------------------- | ------------------- | ------------------- |
| trigger-sos                | Client → Server     | Emergency triggered |
| new-emergency              | Server → Clients    | Broadcast emergency |
| update-location            | Client → Server     | Location update     |
| dispatch-responder         | Dispatcher → Server | Assign responder    |
| responder-location-updated | Server → Clients    | Live movement       |
| api-log                    | Server → Clients    | System logs         |

## 💡 What I Learned From This Project

- Socket.IO real-time communication  
- Express backend development  
- SQLite database handling  
- Full-stack integration between frontend and backend  
- Event-driven architecture design  
- Real-time map visualization using Leaflet.js  

---

## 📈 Future Improvements

- Add authentication system (login/signup)  
- Integrate real GPS tracking  
- Build mobile app version using Flutter / React Native  
- AI-based accident detection system  
- Deploy on cloud platforms (AWS / Render / Railway)  
