# Echo-Blade: Aetherbound (Raylib + ESP32 Glove + Voice)

## Project layout

- `game/src/main.cpp`
- `game/src/SerialHandler.h` / `game/src/SerialHandler.cpp`
- `game/src/VoiceHandler.h` / `game/src/VoiceHandler.cpp`
- `game/src/SharedStatus.h`

## Features implemented

1. Serial 2-bit glove input handler (threaded) from COM9 at 115200
2. Voice handler thread with simulated Vosk command matching
3. Global shared status for glove state and timed voice command
4. Combo logic:
   - GRASP (10) + Strike -> PHYSICAL_ATTACK
   - CHANNEL (11) + Ignis -> FIRE_SPELL
   - GUARD (01) -> DEFEND_STATE
5. Raylib 800x450 window with:
   - player rectangle
   - on-screen debug log
   - visual circle effect on successful combos

## Build on Windows (MSVC)

### Option 1: Console fallback (no Raylib required)

- This mode is now default in `main.cpp` and does not require raylib.
- Simply build normally:

```powershell
cl /std:c++17 /EHsc /Igame/src game/src/*.cpp
```

### Option 2: Raylib (optional)

1. Install Raylib for Windows.
2. Add Raylib include/lib path.
3. Compile:

```powershell
cl /std:c++17 /EHsc /I<raylib_include> /Igame/src game/src/*.cpp /link /LIBPATH:<raylib_lib> raylib.lib winmm.lib gdi32.lib user32.lib kernel32.lib
```

## Build on Windows (MinGW)

```bash
g++ -std=c++17 -I<raylib_include> -L<raylib_lib> game/src/*.cpp -lraylib -lopengl32 -lgdi32 -lwinmm -o echo_blade.exe
```

## Notes

- `SerialHandler` uses Win32 COM API; fallback simulated input is active if `COM9` unavailable.
- `VoiceHandler` currently simulates hits; integrate Vosk in `VoiceHandler::threadLoop` and call callback with recognized words.
- Extend `SharedStatus` for thread-safe buffering and game event logging as needed.

## Web server option (Express + Mongo + client)

A new web version is now available in `web/`.

1. Navigate to `web`:
   - `cd web`
2. Install dependencies:
   - `npm install`
3. Start MongoDB (local):
   - `mongod --dbpath /path/to/your/db`
4. Start server:
   - `npm run start`
5. Open http://localhost:3000

### Behavior

- `POST /api/game/status` receives `{ gloveState, voiceWord }` and returns combo/effect.
- `GET /api/game/history` returns recent events stored in MongoDB.
- UI at `/` includes glove state + voice controls + event log.

