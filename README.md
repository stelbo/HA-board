# HA-board

**Premium Smart Home Dashboard for Home Assistant**

HA-board is a custom component for Home Assistant that provides a beautiful, modern Ofspace-style dashboard with real-time device control, weather monitoring, room management, and scene automation.

![HA-board Dashboard](https://github.com/stelbo/HA-board/raw/main/docs/screenshot.png)

---

## ✨ Features

- 🌤️ **Real-time Weather Widget** — Temperature, condition, humidity, wind speed, and daily forecast
- 🏠 **Room-based Device Organization** — Living Room, Bedroom, Kitchen, Bathroom, Office
- 🎬 **Scene Automation** — One-click Morning ☀️, Away 🚗, Night 🌙, Party 🎉 scenes
- 🔌 **Complete Device Control** — Lights, switches, climate, locks, media players, covers
- ⚡ **Energy Usage Monitoring** — Power consumption bar chart with per-device breakdown
- 🔐 **Security Status** — Lock tracking, motion sensor alerts, alarm status
- 🌙 **Dark / Light Theme Toggle** — Persisted via localStorage
- 📱 **Responsive Design** — Mobile, tablet, desktop layouts
- 🔄 **Real-time State Updates** — WebSocket connection to Home Assistant
- ⚠️ **Error Handling & Fallbacks** — Graceful degradation and reconnection logic

---

## 🚀 Installation

### Option 1 — HACS (Recommended)

1. Open Home Assistant → **HACS** → **Integrations**
2. Click the **+** button → Search for **HA-board**
3. Click **Install** and follow the prompts
4. Restart Home Assistant

### Option 2 — Manual

1. Download the latest release from [GitHub Releases](https://github.com/stelbo/HA-board/releases)
2. Copy the `custom_components/ha_board` directory into your Home Assistant
   `config/custom_components/` directory
3. Restart Home Assistant

---

## ⚙️ Configuration

After installation and restart:

1. Go to **Settings → Devices & Services**
2. Click **+ Add Integration**
3. Search for **HA-board**
4. Enter a Dashboard Name (default: `HA-board`)
5. Click **Submit**

The dashboard will be available in your sidebar.

---

## 📖 Features Overview

### 🏠 Home Tab
The home screen displays:
- Full-width weather widget with real-time data
- Quick stats (lights on, switches, locks, climate)
- Quick-access scene buttons
- Room overview grid
- Energy usage widget
- Security status widget

### 🚪 Rooms Tab
Browse devices organized by room:
- Automatically groups entities by name matching
- Shows active device count per room
- Toggle devices directly from the room view

### 🎬 Scenes Tab
Manage all scenes and automations:
- Quick-access preset scenes (Morning, Away, Night, Party)
- Full list of all Home Assistant scenes
- Automation list with current state

### 📱 Devices Tab
Full device grid organized by type:
- Lights — toggle on/off, see brightness %
- Switches — toggle on/off
- Climate — current/target temperature
- Locks — lock/unlock
- Media Players — current track display
- Covers — open/close, position %
- Fans — toggle
- Vacuums — state display

### ⚙️ Settings Tab
- Toggle dark/light theme
- Connection status indicator
- Entity count and domain breakdown
- Version information

---

## 🎨 Customization

### CSS Variables

Edit `custom_components/ha_board/www/styles.css` to customize the look:

```css
:root {
  --color-primary: #2563eb;      /* Primary accent colour */
  --color-secondary: #06b6d4;    /* Secondary accent colour */
  --color-accent: #8b5cf6;       /* Accent / highlight colour */

  --color-on: #10b981;           /* "ON" state indicator */
  --color-off: #6b7280;          /* "OFF" state indicator */
}
```

### Adding Custom Rooms

Edit `ROOMS_CONFIG` in `custom_components/ha_board/www/app.js`:

```js
const ROOMS_CONFIG = [
  { id: "living_room", name: "Living Room", icon: "🛋️", tempSensor: null },
  { id: "my_room",     name: "My Room",     icon: "🎸", tempSensor: null },
  // ...
];
```

### Linking Scenes

For the quick-scene buttons to work, name your Home Assistant scenes to include:
`morning`, `away`, `night`, or `party` anywhere in their entity ID.

Example: `scene.my_morning_routine`, `scene.away_mode`

---

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/stelbo/HA-board.git

# Copy to your HA custom_components
cp -r custom_components/ha_board /config/custom_components/

# Restart Home Assistant
ha core restart
```

### Project Structure

```
custom_components/ha_board/
├── __init__.py        # HA integration setup
├── config_flow.py     # Configuration UI flow
├── manifest.json      # Component metadata
├── strings.json       # Localization strings
└── www/
    ├── index.html     # Dashboard HTML entry point
    ├── app.js         # Main HABoard application class
    └── styles.css     # Ofspace-style premium CSS
```

---

## 🗺️ Roadmap

- [ ] HACS default repository listing
- [ ] Lovelace panel integration
- [ ] Custom entity-to-room assignment UI
- [ ] Notification history
- [ ] Energy cost calculation
- [ ] Floor plan view
- [ ] Mobile app wrapper (PWA)
- [ ] Multi-language support

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Credits

- Design inspired by [Ofspace](https://ofspace.com) UI principles
- Built on top of the excellent [Home Assistant](https://www.home-assistant.io/) platform
