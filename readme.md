# Echo-Blade: Aetherbound ⚔️🎙️

*An immersive, multi-modal Action-RPG bridging the gap between physical gesture and vocal incantation.*

## 🚀 The Pitch
Welcome to **Echo-Blade: Aetherbound**—a next-generation "Swords and Magic" game that breaks the boundaries of traditional gaming interfaces. Instead of mashing buttons on a standard controller, Aetherbound turns *you* into the weapon. 

Utilizing a custom-built **haptic glove interface** powered by an **ESP32 microcontroller** and **dual-flex sensors**, players navigate the game world through a binary-coded gesture system. But physical movement is only half the battle. Aetherbound features a continuous-listening **voice recognition engine**. 

To survive, you must synchronize your physical gestures with verbal triggers. Physically **"Grasp the Hilt"** by flexing your hand and shout **"Slash!"** to execute a devastating attack, or perform a **"Channel Mana"** gesture while chanting **"Ignis!"** to summon fire. By integrating low-latency serial communication with Natural User Interfaces (NUI), Aetherbound creates a high-stakes, adrenaline-fueled combat flow where your body and voice combined dictate your survival.

---

## ✨ Key Features
- **Dual-Modal Control System**: Combine physical hand gestures with real-time voice commands. 
- **Custom Haptic Hardware**: An ESP32-powered smart glove using flex sensors translates finger configurations (00, 01, 10, 11) into in-game actions.
- **Voice Recognition Combat**: Cast spells or swing your sword by shouting incantations synced with physical movements.
- **Modern Web Architecture**: Built using a lightweight React/Vite frontend and a robust Node/Express backend with SQLite for fast, seamless gameplay.

---

## 🛠️ The Tech Stack

### Hardware (Glove Controller)
- **Microcontroller**: ESP32
- **Sensors**: Dual Analog Flex Sensors (Pins 34 & 35)
- **Communication**: Low-latency 115200 baud Serial communication

### Frontend (Client)
- **Framework**: React 19 + TypeScript + Vite
- **Functionality**: Game rendering, UI, serial connection reading, and local continuous-listening voice recognition.

### Backend (Server)
- **Framework**: Node.js + Express
- **Database**: `better-sqlite3` implementation for maintaining user profiles and scores.
- **Security**: Password hashing configured with `bcryptjs`.

---

## ⚔️ How To Play (Mechanics)
The ESP32 maps your physical hand gestures to a 2-bit system:
* **00**: Neutral / Rest state
* **01 / 10**: Specialized movement / preparing spells
* **11**: Grasp / Attack Intent (both fingers flexed - threshold <500)

**Combat Examples:**
1. **Physical Sword Attack**: Flex both sensors (`11`) + Shout *"Slash"* or *"Strike"*.
2. **Magic Casting**: Hold a channel gesture (`01` or `10`) + Chant *"Ignis"* (Fire) or *"Glacies"* (Ice).
3. **Movement**: Distinct gesture combinations allow forward movement or evasive maneuvers.

---

## ⚙️ Setup & Installation

### 1. Hardware Setup
1. Connect the ESP32 to your machine.
2. Form circuit with flex sensors mapped to Analog Pins 34 and 35.
3. Upload `Gyroscope_test_esp32.ino` using the Arduino IDE (ensure baud rate is 115200).

### 2. Backend Server
```bash
cd web_server/server
npm install
npm run dev
```

### 3. Frontend Client
```bash
cd web_server/client
npm install
npm run dev
```

### 4. Play
Open your browser to your local Vite server (e.g. `http://localhost:5173`). Unmute your microphone and allow the app to connect to your ESP32's serial port.

---

*Created for the Buildathon. Dive into the aether, grasp your hilt, and let your voice be heard!*