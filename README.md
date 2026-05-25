🐾 HanDiGotchi — Full-Stack Virtual Pet Game

Created by: Diana & Hanna

Welcome to HanDiGotchi! This is a web-based virtual pet game using a **client–server** architecture. The Spring Boot server owns game state and rules (including the 4.5s game tick); the browser client handles sprites, menus, particles, and REST calls.

---

## 🛠️ Project structure

| Part | Technology | Folder |
|------|------------|--------|
| **Client** | HTML, CSS, vanilla JavaScript | `client/` (`index.html`, `style.css`, `script.js`, `assets/`) |
| **Server** | Java 17, Spring Boot REST API | `server/` → build `handigotchi-server-1.0.0.jar` |

```
HanDiGotchi!/
├── client/
│   ├── index.html
│   ├── style.css
│   ├── script.js          # UI + fetch() to API (API_BASE at top of file)
│   └── assets/            # Sprites, BGM
└── server/
    ├── pom.xml
    ├── mvnw               # Maven Wrapper (no global Maven required)
    └── src/main/java/com/handigotchi/
        ├── HanDiGotchiApplication.java
        ├── config/WebConfig.java          # CORS for /api/**
        ├── controller/GameController.java # REST endpoints
        ├── model/                         # DTOs + request bodies
        └── game/
            ├── GameService.java           # Tick + rules
            ├── GameState.java
            └── GameConstants.java
```

---

## 🚀 How to run locally

### Prerequisites

- **Java 17+** — [Adoptium](https://adoptium.net/) or similar  
- A **static HTTP server** for the client (browsers block `file://` + `fetch`)

```bash
java -version
cd server && ./mvnw -version
```

### Step 1 — Start the Spring Boot backend

The server must be running first.

**Option A (IDE):** Open `server/` and run `HanDiGotchiApplication`.

**Option B (JAR):**

```bash
cd server
./mvnw clean package
java -jar target/handigotchi-server-1.0.0.jar
```

Server listens on **http://localhost:8080**.

### Step 2 — Serve the frontend

From the **`client/`** folder (where `index.html` lives):

```bash
cd client
python3 -m http.server 5500
```

Open **http://localhost:5500** in your browser.

> VS Code **Live Server** works too — point it at `client/`. Do **not** open `index.html` via `file://` (CORS will fail).

### Step 3 — Play

1. Start Spring Boot (port **8080**).  
2. Start the static client (port **5500**).  
3. Pick a character (**H** or **D**), tap the egg **3 times** to hatch, then feed, play, clean, sleep, and medicate as needed.

If you see **"Server offline!"**, the backend is not running or the port/CORS setup does not match.

---

## 🔌 REST API reference

Base URL (in `client/script.js`): `http://localhost:8080/api`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | Current game state (polled every ~2s) |
| `POST` | `/api/reset` | New egg game — called on page load |
| `POST` | `/api/restart` | New egg game — in-game restart / ending restart button |
| `POST` | `/api/select-character` | Body: `{ "type": "h" }` or `{ "type": "d" }` |
| `POST` | `/api/egg/click` | Hatch progress (+1 click; hatches at 3) |
| `POST` | `/api/feed/meal` | Body: `{ "id": "onigiri" }` — also `dumpling`, `burger`, `omurice` |
| `POST` | `/api/feed/snack` | Body: `{ "id": "pudding" }` — also `cookie`, `cake` |
| `POST` | `/api/play` | Play mini-game (+happy, −energy) |
| `POST` | `/api/sleep` | Toggle sleep (teen & adult only) |
| `POST` | `/api/med` | Cure sickness (+50 hunger/happy/energy) |
| `POST` | `/api/clean` | Remove one poop (+15 happy) |
| `POST` | `/api/happy-ending/continue` | After **Happy Ending** → “Stay with me” (endless mode) |
| `POST` | `/api/happy-ending/restart` | Same as `/api/restart` (UI uses `/restart`) |

Example:

```bash
curl http://localhost:8080/api/status
curl -X POST http://localhost:8080/api/feed/meal -H "Content-Type: application/json" -d '{"id":"burger"}'
curl -X POST http://localhost:8080/api/feed/snack -H "Content-Type: application/json" -d '{"id":"pudding"}'
```

---

## 🎮 Game features (server rules)

### Growth stages

Stages: **egg** → **baby** → **teen** → **adult**.

| Transition | How |
|------------|-----|
| Egg → Baby | **3** egg clicks (`POST /api/egg/click`) after choosing **h** or **d** |
| Baby → Teen | **60s** survival in baby stage |
| Teen → Adult | **120s** survival in teen stage |
| Adult → Ending | **120s** survival in adult stage |

Survival time resets when you evolve. The server ticks every **4.5s** (stats decay, poop, sickness timer, evolution checks).

### Stats, poop & hygiene

- Hunger, happy, and energy are **0–100** and decay **2** per tick (happy also loses **+1 per poop** on screen).
- Poop spawns on a random **45–90s** timer (up to **5**); `POST /api/clean` removes one.
- **Sleep** (teen/adult): toggles sleep, regens **+15** energy per tick; no poop while sleeping. **Baby** cannot sleep (server + UI hide the button).

### Sickness & “ghost” (death)

- **Baby** and **egg** cannot get sick.
- **Teen/adult** get sick if **hunger, happy, or energy** hits **0**, or if you eat too many of the same snack in a row (overload: pudding **5**, cookie **3**, cake **2**).
- While sick, use **med** within **45s** or the pet **dies** (`dead: true`) — the client shows the **ghost** sprite and restart prompt. This is **not** a story ending type; it is death from neglect.
- Poop does not directly trigger sickness; it speeds up **happy** decay.

### Endings (grown-up, not ghost)

When adult survival reaches **120s**, an ending cutscene runs:

| `endingType` | Condition | UI |
|--------------|-----------|-----|
| **`happy`** | Got sick **at most once** in the whole run | “Stay with me” → endless mode (server stops decay/sick/poop ticks) |
| **`normal`** | Got sick **more than once** | Farewell story; restart via `/api/restart` |

The client polls `GET /api/status` and drives animations; all rules above live in `GameService.java` / `GameConstants.java`.

### Meals & snacks (IDs must match server)

| Meals | Hunger / Energy |
|-------|-----------------|
| `onigiri` | +20 / +5 |
| `dumpling` | +35 / +10 |
| `burger` | +50 / +15 |
| `omurice` | +80 / +25 |

| Snacks | Happy | Overload streak |
|--------|-------|-----------------|
| `pudding` | +15 | 5 in a row → sick |
| `cookie` | +30 | 3 in a row → sick |
| `cake` | +50 | 2 in a row → sick |

---

## ⚙️ Optional: change API URL or port

In `client/script.js`:

```javascript
const API_BASE = 'http://localhost:8080/api';
```

If you change `server.port` in `server/src/main/resources/application.properties`, update `API_BASE` to match.

---

## 🩹 Troubleshooting

| Problem | Fix |
|---------|-----|
| CORS errors | Backend must be running; `WebConfig.java` and `GameController` allow **`http://localhost:5500`** and **`http://127.0.0.1:5500`** only |
| `fetch` failed | Serve from **`client/`** over `http://`, not `file://` |
| Port **8080** in use | Change `server.port` in `application.properties` and `API_BASE` in `script.js` |
| Maven not installed | Use `./mvnw` inside `server/` |

---

## 📦 Submission checklist

- [ ] `server/target/handigotchi-server-1.0.0.jar` built with `./mvnw package`
- [ ] README explains client (`client/`) + server (`server/`) startup
- [ ] Demo: browser client talking to Spring Boot over REST
