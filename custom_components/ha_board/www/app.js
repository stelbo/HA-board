/**
 * HA-board - Premium Smart Home Dashboard
 * Version: 2.0.0
 * Full Home Assistant integration with Ofspace-style design
 */

"use strict";

/* =========================================================
   CONSTANTS & CONFIGURATION
   ========================================================= */

const HA_BOARD_VERSION = "2.0.0";

const DEVICE_ICONS = {
  light: "💡",
  switch: "🔌",
  climate: "🌡️",
  lock: "🔒",
  media_player: "🎵",
  cover: "🪟",
  sensor: "📡",
  binary_sensor: "👁️",
  automation: "⚡",
  scene: "🎬",
  script: "📜",
  camera: "📷",
  alarm_control_panel: "🚨",
  fan: "💨",
  vacuum: "🤖",
  water_heater: "🚿",
  default: "📱",
};

const ROOM_ICONS = {
  living_room: "🛋️",
  bedroom: "🛏️",
  kitchen: "🍳",
  bathroom: "🚿",
  office: "💼",
  garage: "🚗",
  garden: "🌿",
  hallway: "🚪",
  default: "🏠",
};

const SCENE_CONFIGS = [
  { id: "morning", name: "Morning", icon: "☀️", color: "#f59e0b" },
  { id: "away", name: "Away", icon: "🚗", color: "#6366f1" },
  { id: "night", name: "Night", icon: "🌙", color: "#1e40af" },
  { id: "party", name: "Party", icon: "🎉", color: "#ec4899" },
];

const ROOMS_CONFIG = [
  { id: "living_room", name: "Living Room", icon: "🛋️", tempSensor: null },
  { id: "bedroom", name: "Bedroom", icon: "🛏️", tempSensor: null },
  { id: "kitchen", name: "Kitchen", icon: "🍳", tempSensor: null },
  { id: "bathroom", name: "Bathroom", icon: "🚿", tempSensor: null },
  { id: "office", name: "Office", icon: "💼", tempSensor: null },
];

/* =========================================================
   UTILITY HELPERS
   ========================================================= */

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatEntityName(entityId) {
  const name = entityId.split(".")[1] || entityId;
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getEntityDomain(entityId) {
  return (entityId || "").split(".")[0] || "";
}

function isOnState(state) {
  return ["on", "open", "playing", "home", "unlocked", "active"].includes(
    (state || "").toLowerCase()
  );
}

/* =========================================================
   HOME ASSISTANT CONNECTION
   ========================================================= */

class HAConnection {
  constructor(onStateChange, onConnect, onDisconnect) {
    this.ws = null;
    this.msgId = 1;
    this.pendingRequests = new Map();
    this.subscriptionCallbacks = new Map();
    this.connected = false;
    this.reconnectTimer = null;
    this.reconnectDelay = 3000;
    this.maxReconnectDelay = 30000;

    this.onStateChange = onStateChange;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;

    this._accessToken = null;
    this._wsUrl = null;
  }

  async connect() {
    try {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      this._wsUrl = `${proto}://${location.host}/api/websocket`;
      this._accessToken = await this._getAccessToken();
      this._openWebSocket();
    } catch (err) {
      console.error("[HA-board] Connection error:", err);
      this._scheduleReconnect();
    }
  }

  async _getAccessToken() {
    // Try to get auth token from HA's auth provider
    if (window.__HA_BOARD_TOKEN__) return window.__HA_BOARD_TOKEN__;

    // Attempt fetch to check if we are running inside HA panel
    try {
      const resp = await fetch("/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=refresh_token&client_id=" + encodeURIComponent(location.origin),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.access_token || null;
      }
    } catch (_) { /* ignore */ }

    return null;
  }

  _openWebSocket() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) { /* ignore */ }
    }

    this.ws = new WebSocket(this._wsUrl);

    this.ws.onopen = () => {
      console.log("[HA-board] WebSocket opened");
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._handleMessage(msg);
      } catch (err) {
        console.error("[HA-board] Message parse error:", err);
      }
    };

    this.ws.onerror = (err) => {
      console.error("[HA-board] WebSocket error:", err);
    };

    this.ws.onclose = () => {
      this.connected = false;
      console.warn("[HA-board] WebSocket closed");
      if (this.onDisconnect) this.onDisconnect();
      this._scheduleReconnect();
    };
  }

  _handleMessage(msg) {
    if (msg.type === "auth_required") {
      this._sendAuth();
      return;
    }

    if (msg.type === "auth_ok") {
      this.connected = true;
      this.reconnectDelay = 3000;
      console.log("[HA-board] Authenticated with Home Assistant");
      if (this.onConnect) this.onConnect();
      this._subscribeToStateChanges();
      return;
    }

    if (msg.type === "auth_invalid") {
      console.error("[HA-board] Authentication failed");
      return;
    }

    // Only handle messages whose ID is a positive integer that we issued
    const msgId = typeof msg.id === "number" && Number.isInteger(msg.id) && msg.id > 0
      ? msg.id
      : null;

    if (msg.type === "result" && msgId !== null) {
      const pending = this.pendingRequests.get(msgId);
      if (pending) {
        this.pendingRequests.delete(msgId);
        if (msg.success) {
          pending.resolve(msg.result);
        } else {
          pending.reject(new Error(msg.error?.message || "Unknown error"));
        }
      }
      return;
    }

    if (msg.type === "event" && msgId !== null) {
      const handler = this.subscriptionCallbacks.get(msgId);
      if (typeof handler === "function") {
        handler(msg.event);
      }
      return;
    }
  }

  _sendAuth() {
    const authMsg = { type: "auth" };
    if (this._accessToken) {
      authMsg.access_token = this._accessToken;
    } else {
      // Fall back to long-lived token from URL hash if present
      const hash = location.hash.replace("#", "");
      if (hash) authMsg.access_token = hash;
    }
    this._send(authMsg);
  }

  _subscribeToStateChanges() {
    const id = this.msgId++;
    this.subscriptionCallbacks.set(id, (event) => {
      if (event.event_type === "state_changed" && this.onStateChange) {
        this.onStateChange(event.data.entity_id, event.data.new_state);
      }
    });
    this._send({ id, type: "subscribe_events", event_type: "state_changed" });
  }

  _send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendCommand(type, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error("Not connected"));
        return;
      }
      const id = this.msgId++;
      this.pendingRequests.set(id, { resolve, reject });
      this._send({ id, type, ...params });
    });
  }

  getStates() {
    return this.sendCommand("get_states");
  }

  callService(domain, service, serviceData = {}) {
    return this.sendCommand("call_service", {
      domain,
      service,
      service_data: serviceData,
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      console.log("[HA-board] Reconnecting...");
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.connected = false;
  }
}

/* =========================================================
   HA-BOARD MAIN CLASS
   ========================================================= */

class HABoard {
  constructor() {
    this.haConnection = null;
    this.states = new Map();
    this.currentView = "home";
    this.theme = localStorage.getItem("ha-board-theme") || "dark";
    this.initialized = false;

    this.weatherEntityId = null;
    this.rooms = JSON.parse(JSON.stringify(ROOMS_CONFIG));

    this._debouncedRender = debounce(() => this._renderCurrentView(), 100);
  }

  /* ----------------------------------------------------------
     INITIALIZATION
     ---------------------------------------------------------- */

  async init() {
    this._applyTheme();
    this._renderApp();

    this.haConnection = new HAConnection(
      (entityId, newState) => this._onStateChange(entityId, newState),
      () => this._onConnected(),
      () => this._onDisconnected()
    );

    await this.haConnection.connect();
  }

  async _onConnected() {
    this._updateConnectionStatus(true);
    try {
      const states = await this.haConnection.getStates();
      states.forEach((s) => this.states.set(s.entity_id, s));
      this._detectWeatherEntity();
      this._detectRoomSensors();
      this.initialized = true;
      this._renderCurrentView();
    } catch (err) {
      console.error("[HA-board] Failed to load states:", err);
    }
  }

  _onDisconnected() {
    this._updateConnectionStatus(false);
  }

  _onStateChange(entityId, newState) {
    if (newState) {
      this.states.set(entityId, newState);
    } else {
      this.states.delete(entityId);
    }
    this._debouncedRender();
  }

  _detectWeatherEntity() {
    for (const [id] of this.states) {
      if (id.startsWith("weather.")) {
        this.weatherEntityId = id;
        break;
      }
    }
  }

  _detectRoomSensors() {
    const tempSensors = [];
    for (const [id, state] of this.states) {
      if (
        id.startsWith("sensor.") &&
        state.attributes?.unit_of_measurement === "°C" ||
        state.attributes?.unit_of_measurement === "°F"
      ) {
        tempSensors.push(id);
      }
    }

    this.rooms.forEach((room, i) => {
      const match = tempSensors.find((s) =>
        s.toLowerCase().includes(room.id.replace("_", ""))
      );
      if (match) room.tempSensor = match;
      else if (tempSensors[i]) room.tempSensor = tempSensors[i];
    });
  }

  /* ----------------------------------------------------------
     THEME
     ---------------------------------------------------------- */

  _applyTheme() {
    document.documentElement.setAttribute("data-theme", this.theme);
  }

  toggleTheme() {
    this.theme = this.theme === "dark" ? "light" : "dark";
    localStorage.setItem("ha-board-theme", this.theme);
    this._applyTheme();
    this._renderCurrentView();
  }

  /* ----------------------------------------------------------
     NAVIGATION
     ---------------------------------------------------------- */

  navigate(view) {
    this.currentView = view;
    this._renderCurrentView();
    this._updateNavActive(view);
  }

  _updateNavActive(view) {
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.view === view);
    });
  }

  _updateConnectionStatus(connected) {
    const dot = document.getElementById("connection-dot");
    const label = document.getElementById("connection-label");
    if (dot) dot.className = `status-dot ${connected ? "online" : "offline"}`;
    if (label) label.textContent = connected ? "Connected" : "Disconnected";
  }

  /* ----------------------------------------------------------
     RENDERING DISPATCHER
     ---------------------------------------------------------- */

  _renderCurrentView() {
    const main = document.getElementById("main-content");
    if (!main) return;

    switch (this.currentView) {
      case "home":
        main.innerHTML = this._renderHomeView();
        break;
      case "rooms":
        main.innerHTML = this._renderRoomsView();
        break;
      case "scenes":
        main.innerHTML = this._renderScenesView();
        break;
      case "devices":
        main.innerHTML = this._renderDevicesView();
        break;
      case "settings":
        main.innerHTML = this._renderSettingsView();
        break;
      default:
        main.innerHTML = this._renderHomeView();
    }

    this._attachEventListeners();
  }

  /* ----------------------------------------------------------
     HOME VIEW
     ---------------------------------------------------------- */

  _renderHomeView() {
    return `
      <div class="view home-view">
        ${this._renderWeatherWidget()}
        ${this._renderQuickStats()}
        ${this._renderSceneButtons()}
        ${this._renderRoomGrid()}
        ${this._renderEnergyWidget()}
        ${this._renderSecurityWidget()}
      </div>
    `;
  }

  _renderWeatherWidget() {
    const weather = this.weatherEntityId
      ? this.states.get(this.weatherEntityId)
      : null;

    const condition = weather?.state || "unknown";
    const attrs = weather?.attributes || {};
    const temp = attrs.temperature != null ? attrs.temperature : "--";
    const unit = attrs.temperature_unit || "°C";
    const humidity = attrs.humidity != null ? `${attrs.humidity}%` : "--";
    const windSpeed = attrs.wind_speed != null ? `${attrs.wind_speed} km/h` : "--";
    const forecast = attrs.forecast || [];
    const forecastHigh = forecast[0]?.temperature != null ? forecast[0].temperature : "--";
    const forecastLow = forecast[0]?.templow != null ? forecast[0].templow : "--";

    const conditionIcons = {
      sunny: "☀️",
      clear_night: "🌙",
      cloudy: "☁️",
      partlycloudy: "⛅",
      rainy: "🌧️",
      snowy: "❄️",
      lightning: "⚡",
      windy: "💨",
      fog: "🌫️",
      hail: "🌨️",
      unknown: "🌤️",
    };

    const conditionIcon = conditionIcons[condition] || conditionIcons.unknown;

    return `
      <div class="widget weather-widget">
        <div class="weather-main">
          <div class="weather-icon">${conditionIcon}</div>
          <div class="weather-info">
            <div class="weather-temp">${temp}${unit}</div>
            <div class="weather-condition">${capitalize(condition.replace(/_/g, " "))}</div>
            <div class="weather-location">${attrs.friendly_name || "Home"}</div>
          </div>
        </div>
        <div class="weather-details">
          <div class="weather-detail">
            <span class="detail-icon">🌡️</span>
            <span class="detail-label">H/L</span>
            <span class="detail-value">${forecastHigh}/${forecastLow}${unit}</span>
          </div>
          <div class="weather-detail">
            <span class="detail-icon">💨</span>
            <span class="detail-label">Wind</span>
            <span class="detail-value">${windSpeed}</span>
          </div>
          <div class="weather-detail">
            <span class="detail-icon">💧</span>
            <span class="detail-label">Humidity</span>
            <span class="detail-value">${humidity}</span>
          </div>
        </div>
      </div>
    `;
  }

  _renderQuickStats() {
    const allEntities = [...this.states.values()];
    const lights = allEntities.filter((s) => s.entity_id.startsWith("light."));
    const switches = allEntities.filter((s) => s.entity_id.startsWith("switch."));
    const locks = allEntities.filter((s) => s.entity_id.startsWith("lock."));
    const climates = allEntities.filter((s) => s.entity_id.startsWith("climate."));

    const lightsOn = lights.filter((s) => isOnState(s.state)).length;
    const switchesOn = switches.filter((s) => isOnState(s.state)).length;
    const locksLocked = locks.filter((s) => s.state === "locked").length;
    const activeClimate = climates.filter((s) => s.state !== "off").length;

    return `
      <div class="quick-stats">
        <div class="stat-card">
          <div class="stat-icon">💡</div>
          <div class="stat-info">
            <div class="stat-value">${lightsOn}/${lights.length}</div>
            <div class="stat-label">Lights On</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🔌</div>
          <div class="stat-info">
            <div class="stat-value">${switchesOn}/${switches.length}</div>
            <div class="stat-label">Switches On</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🔒</div>
          <div class="stat-info">
            <div class="stat-value">${locksLocked}/${locks.length}</div>
            <div class="stat-label">Locked</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🌡️</div>
          <div class="stat-info">
            <div class="stat-value">${activeClimate}/${climates.length}</div>
            <div class="stat-label">Climate</div>
          </div>
        </div>
      </div>
    `;
  }

  _renderSceneButtons() {
    const sceneEntities = [...this.states.values()].filter((s) =>
      s.entity_id.startsWith("scene.")
    );

    const scenes = SCENE_CONFIGS.map((cfg) => {
      const entity = sceneEntities.find((s) =>
        s.entity_id.toLowerCase().includes(cfg.id)
      );
      return { ...cfg, entityId: entity?.entity_id || null };
    });

    return `
      <div class="section">
        <h2 class="section-title">Scenes</h2>
        <div class="scene-grid">
          ${scenes
            .map(
              (s) => `
            <button class="scene-btn" data-scene="${s.id}" data-entity="${s.entityId || ""}" style="--scene-color: ${s.color}">
              <span class="scene-icon">${s.icon}</span>
              <span class="scene-name">${s.name}</span>
            </button>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  _renderRoomGrid() {
    const allEntities = [...this.states.values()];

    return `
      <div class="section">
        <h2 class="section-title">Rooms</h2>
        <div class="room-grid">
          ${this.rooms
            .map((room) => {
              const roomDevices = allEntities.filter((s) => {
                const name = (s.attributes?.friendly_name || s.entity_id).toLowerCase();
                return (
                  name.includes(room.id.replace("_", " ")) ||
                  name.includes(room.id)
                );
              });

              const activeDevices = roomDevices.filter((s) =>
                isOnState(s.state)
              ).length;

              const tempState = room.tempSensor
                ? this.states.get(room.tempSensor)
                : null;
              const tempDisplay = tempState
                ? `${tempState.state}${tempState.attributes?.unit_of_measurement || "°C"}`
                : "--";

              return `
              <div class="room-card" data-room="${room.id}">
                <div class="room-icon">${room.icon}</div>
                <div class="room-info">
                  <div class="room-name">${room.name}</div>
                  <div class="room-stats">
                    <span>${activeDevices} active</span>
                    <span class="room-temp">${tempDisplay}</span>
                  </div>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  _renderEnergyWidget() {
    const powerSensors = [...this.states.values()].filter(
      (s) =>
        s.entity_id.startsWith("sensor.") &&
        (s.attributes?.device_class === "power" ||
          s.attributes?.unit_of_measurement === "W" ||
          s.attributes?.unit_of_measurement === "kW")
    );

    const totalPower = powerSensors.reduce((sum, s) => {
      const val = parseFloat(s.state);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    const maxPower = 5000;
    const percentage = Math.min((totalPower / maxPower) * 100, 100);

    return `
      <div class="widget energy-widget">
        <div class="widget-header">
          <h3 class="widget-title">⚡ Energy Usage</h3>
          <span class="widget-value">${totalPower.toFixed(1)} W</span>
        </div>
        <div class="energy-bar-container">
          <div class="energy-bar" style="width: ${percentage}%"></div>
        </div>
        <div class="energy-sensors">
          ${powerSensors
            .slice(0, 4)
            .map(
              (s) => `
            <div class="energy-item">
              <span class="energy-name">${s.attributes?.friendly_name || formatEntityName(s.entity_id)}</span>
              <span class="energy-val">${s.state} ${s.attributes?.unit_of_measurement || "W"}</span>
            </div>
          `
            )
            .join("") || '<div class="no-data">No power sensors found</div>'}
        </div>
      </div>
    `;
  }

  _renderSecurityWidget() {
    const locks = [...this.states.values()].filter((s) =>
      s.entity_id.startsWith("lock.")
    );
    const alarms = [...this.states.values()].filter((s) =>
      s.entity_id.startsWith("alarm_control_panel.")
    );
    const motionSensors = [...this.states.values()].filter(
      (s) =>
        s.entity_id.startsWith("binary_sensor.") &&
        s.attributes?.device_class === "motion"
    );

    const unlockedLocks = locks.filter((s) => s.state !== "locked");
    const activeMotion = motionSensors.filter((s) => s.state === "on");
    const secureStatus = unlockedLocks.length === 0 && activeMotion.length === 0;

    return `
      <div class="widget security-widget">
        <div class="widget-header">
          <h3 class="widget-title">🔐 Security</h3>
          <span class="security-status ${secureStatus ? "secure" : "alert"}">${secureStatus ? "Secure" : "Alert"}</span>
        </div>
        <div class="security-items">
          <div class="security-item">
            <span>🔒 Locks</span>
            <span class="${unlockedLocks.length > 0 ? "alert-text" : "ok-text"}">${locks.length - unlockedLocks.length}/${locks.length} locked</span>
          </div>
          <div class="security-item">
            <span>👁️ Motion</span>
            <span class="${activeMotion.length > 0 ? "alert-text" : "ok-text"}">${activeMotion.length} active</span>
          </div>
          ${
            alarms.length > 0
              ? `<div class="security-item">
            <span>🚨 Alarm</span>
            <span>${alarms[0].state}</span>
          </div>`
              : ""
          }
        </div>
      </div>
    `;
  }

  /* ----------------------------------------------------------
     ROOMS VIEW
     ---------------------------------------------------------- */

  _renderRoomsView() {
    return `
      <div class="view rooms-view">
        <h1 class="view-title">Rooms</h1>
        ${this.rooms
          .map((room) => {
            const roomDevices = [...this.states.values()].filter((s) => {
              const name = (s.attributes?.friendly_name || s.entity_id).toLowerCase();
              return (
                name.includes(room.id.replace(/_/g, " ")) ||
                name.includes(room.id.replace("_", ""))
              );
            });

            const controllable = roomDevices.filter((s) =>
              ["light", "switch", "cover", "lock", "climate", "media_player"].includes(
                getEntityDomain(s.entity_id)
              )
            );

            return `
            <div class="room-section">
              <div class="room-section-header">
                <span class="room-section-icon">${room.icon}</span>
                <h2 class="room-section-title">${room.name}</h2>
                <span class="room-device-count">${controllable.length} devices</span>
              </div>
              <div class="device-grid">
                ${
                  controllable.length > 0
                    ? controllable
                        .map((s) => this._renderDeviceCard(s))
                        .join("")
                    : '<div class="no-devices">No devices found in this room</div>'
                }
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  }

  /* ----------------------------------------------------------
     SCENES VIEW
     ---------------------------------------------------------- */

  _renderScenesView() {
    const sceneEntities = [...this.states.values()].filter((s) =>
      s.entity_id.startsWith("scene.")
    );
    const automations = [...this.states.values()].filter((s) =>
      s.entity_id.startsWith("automation.")
    );

    return `
      <div class="view scenes-view">
        <h1 class="view-title">Scenes &amp; Automations</h1>

        <div class="section">
          <h2 class="section-title">Quick Scenes</h2>
          <div class="scene-full-grid">
            ${SCENE_CONFIGS.map((cfg) => {
              const entity = sceneEntities.find((s) =>
                s.entity_id.toLowerCase().includes(cfg.id)
              );
              return `
                <div class="scene-full-card" data-scene="${cfg.id}" data-entity="${entity?.entity_id || ""}">
                  <div class="scene-full-icon" style="background: ${cfg.color}20; border-color: ${cfg.color}40">${cfg.icon}</div>
                  <div class="scene-full-name">${cfg.name}</div>
                  ${entity ? `<div class="scene-entity-id">${entity.entity_id}</div>` : '<div class="scene-entity-id">No entity linked</div>'}
                  <button class="scene-activate-btn" data-entity="${entity?.entity_id || ""}" style="background: ${cfg.color}">Activate</button>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        ${
          sceneEntities.length > 0
            ? `
          <div class="section">
            <h2 class="section-title">All Scenes (${sceneEntities.length})</h2>
            <div class="entity-list">
              ${sceneEntities
                .map(
                  (s) => `
                <div class="entity-list-item">
                  <span class="entity-icon">🎬</span>
                  <span class="entity-name">${s.attributes?.friendly_name || formatEntityName(s.entity_id)}</span>
                  <button class="activate-btn" data-entity="${s.entity_id}">Activate</button>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        `
            : ""
        }

        ${
          automations.length > 0
            ? `
          <div class="section">
            <h2 class="section-title">Automations (${automations.length})</h2>
            <div class="entity-list">
              ${automations
                .map(
                  (s) => `
                <div class="entity-list-item">
                  <span class="entity-icon">⚡</span>
                  <span class="entity-name">${s.attributes?.friendly_name || formatEntityName(s.entity_id)}</span>
                  <span class="entity-state ${isOnState(s.state) ? "state-on" : "state-off"}">${s.state}</span>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  /* ----------------------------------------------------------
     DEVICES VIEW
     ---------------------------------------------------------- */

  _renderDevicesView() {
    const domains = [
      { domain: "light", label: "Lights", icon: "💡" },
      { domain: "switch", label: "Switches", icon: "🔌" },
      { domain: "climate", label: "Climate", icon: "🌡️" },
      { domain: "lock", label: "Locks", icon: "🔒" },
      { domain: "media_player", label: "Media Players", icon: "🎵" },
      { domain: "cover", label: "Covers & Blinds", icon: "🪟" },
      { domain: "fan", label: "Fans", icon: "💨" },
      { domain: "vacuum", label: "Vacuums", icon: "🤖" },
    ];

    return `
      <div class="view devices-view">
        <h1 class="view-title">All Devices</h1>
        ${domains
          .map((d) => {
            const entities = [...this.states.values()].filter((s) =>
              s.entity_id.startsWith(`${d.domain}.`)
            );
            if (entities.length === 0) return "";

            const activeCount = entities.filter((s) => isOnState(s.state)).length;

            return `
            <div class="section">
              <div class="section-header">
                <h2 class="section-title">${d.icon} ${d.label}</h2>
                <span class="device-count">${activeCount}/${entities.length} active</span>
              </div>
              <div class="device-grid">
                ${entities.map((s) => this._renderDeviceCard(s)).join("")}
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  }

  _renderDeviceCard(state) {
    if (!state) return "";

    const domain = getEntityDomain(state.entity_id);
    const icon = DEVICE_ICONS[domain] || DEVICE_ICONS.default;
    const name = state.attributes?.friendly_name || formatEntityName(state.entity_id);
    const isOn = isOnState(state.state);
    const isToggleable = ["light", "switch", "lock", "cover", "fan"].includes(domain);

    let extraInfo = "";
    if (domain === "climate") {
      const target = state.attributes?.temperature;
      const current = state.attributes?.current_temperature;
      extraInfo = current != null ? `${current}°` : state.state;
      if (target != null) extraInfo += ` → ${target}°`;
    } else if (domain === "media_player") {
      extraInfo = state.attributes?.media_title || state.state;
    } else if (domain === "lock") {
      extraInfo = state.state;
    } else if (domain === "cover") {
      const pos = state.attributes?.current_position;
      extraInfo = pos != null ? `${pos}%` : state.state;
    } else if (domain === "light" && state.attributes?.brightness != null) {
      extraInfo = `${Math.round((state.attributes.brightness / 255) * 100)}%`;
    }

    return `
      <div class="device-card ${isOn ? "device-on" : "device-off"}" data-entity="${state.entity_id}">
        <div class="device-header">
          <span class="device-icon">${icon}</span>
          ${
            isToggleable
              ? `<button class="toggle-btn ${isOn ? "toggle-on" : "toggle-off"}" data-entity="${state.entity_id}" data-domain="${domain}">
              <span class="toggle-indicator"></span>
            </button>`
              : `<span class="device-state-badge ${isOn ? "state-on" : "state-off"}">${state.state}</span>`
          }
        </div>
        <div class="device-name">${name}</div>
        ${extraInfo ? `<div class="device-extra">${extraInfo}</div>` : ""}
      </div>
    `;
  }

  /* ----------------------------------------------------------
     SETTINGS VIEW
     ---------------------------------------------------------- */

  _renderSettingsView() {
    const allEntities = [...this.states.values()];
    const domainCounts = {};
    allEntities.forEach((s) => {
      const d = getEntityDomain(s.entity_id);
      domainCounts[d] = (domainCounts[d] || 0) + 1;
    });

    return `
      <div class="view settings-view">
        <h1 class="view-title">Settings</h1>

        <div class="settings-section">
          <h2 class="settings-section-title">Appearance</h2>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">Theme</span>
              <span class="settings-item-desc">Switch between dark and light mode</span>
            </div>
            <button class="theme-toggle-btn" id="theme-toggle-btn" onclick="haBoard.toggleTheme()">
              ${this.theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
            </button>
          </div>
        </div>

        <div class="settings-section">
          <h2 class="settings-section-title">Connection</h2>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">Status</span>
            </div>
            <div class="connection-status-display">
              <span class="status-dot ${this.haConnection?.connected ? "online" : "offline"}"></span>
              <span>${this.haConnection?.connected ? "Connected" : "Disconnected"}</span>
            </div>
          </div>
          <div class="settings-item">
            <div class="settings-item-info">
              <span class="settings-item-label">Total Entities</span>
            </div>
            <span class="settings-item-value">${allEntities.length}</span>
          </div>
        </div>

        <div class="settings-section">
          <h2 class="settings-section-title">Entity Breakdown</h2>
          <div class="entity-breakdown">
            ${Object.entries(domainCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(
                ([domain, count]) => `
              <div class="breakdown-item">
                <span class="breakdown-icon">${DEVICE_ICONS[domain] || "📱"}</span>
                <span class="breakdown-domain">${domain}</span>
                <span class="breakdown-count">${count}</span>
              </div>
            `
              )
              .join("")}
          </div>
        </div>

        <div class="settings-section">
          <h2 class="settings-section-title">About</h2>
          <div class="settings-item">
            <span class="settings-item-label">HA-board</span>
            <span class="settings-item-value">v${HA_BOARD_VERSION}</span>
          </div>
          <div class="settings-item">
            <span class="settings-item-label">Design</span>
            <span class="settings-item-value">Ofspace Style</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ----------------------------------------------------------
     MAIN APP SCAFFOLD
     ---------------------------------------------------------- */

  _renderApp() {
    const app = document.getElementById("app");
    if (!app) return;

    app.innerHTML = `
      <div class="ha-board">
        <header class="top-bar">
          <div class="top-bar-left">
            <div class="logo">🏠 HA-board</div>
          </div>
          <div class="top-bar-right">
            <div class="connection-indicator">
              <span class="status-dot offline" id="connection-dot"></span>
              <span id="connection-label">Connecting...</span>
            </div>
            <button class="icon-btn" onclick="haBoard.toggleTheme()" title="Toggle theme">
              ${this.theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </header>

        <main id="main-content" class="main-content">
          <div class="loading-indicator">
            <div class="loading-spinner"></div>
            <p>Connecting to Home Assistant...</p>
          </div>
        </main>

        <nav class="bottom-nav">
          ${[
            { view: "home", icon: "🏠", label: "Home" },
            { view: "rooms", icon: "🚪", label: "Rooms" },
            { view: "scenes", icon: "🎬", label: "Scenes" },
            { view: "devices", icon: "📱", label: "Devices" },
            { view: "settings", icon: "⚙️", label: "Settings" },
          ]
            .map(
              (n) => `
            <button class="nav-item ${n.view === this.currentView ? "active" : ""}" data-view="${n.view}" onclick="haBoard.navigate('${n.view}')">
              <span class="nav-icon">${n.icon}</span>
              <span class="nav-label">${n.label}</span>
            </button>
          `
            )
            .join("")}
        </nav>
      </div>
    `;
  }

  /* ----------------------------------------------------------
     EVENT LISTENERS
     ---------------------------------------------------------- */

  _attachEventListeners() {
    // Toggle buttons (lights, switches, etc.)
    document.querySelectorAll(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const entityId = btn.dataset.entity;
        const domain = btn.dataset.domain;
        this._toggleDevice(entityId, domain);
      });
    });

    // Scene activate buttons
    document.querySelectorAll("[data-entity].scene-activate-btn, .activate-btn[data-entity]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const entityId = btn.dataset.entity;
        if (entityId) this._activateScene(entityId);
      });
    });

    // Scene quick buttons
    document.querySelectorAll(".scene-btn[data-scene]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entityId = btn.dataset.entity;
        if (entityId) this._activateScene(entityId);
        else this._activateQuickScene(btn.dataset.scene);
      });
    });

    // Room cards navigate to rooms view
    document.querySelectorAll(".room-card[data-room]").forEach((card) => {
      card.addEventListener("click", () => {
        this.navigate("rooms");
      });
    });
  }

  /* ----------------------------------------------------------
     DEVICE CONTROL
     ---------------------------------------------------------- */

  async _toggleDevice(entityId, domain) {
    if (!this.haConnection?.connected) return;

    const state = this.states.get(entityId);
    if (!state) return;

    try {
      let service;
      let serviceData = { entity_id: entityId };

      if (domain === "lock") {
        service = state.state === "locked" ? "unlock" : "lock";
      } else if (domain === "cover") {
        service = isOnState(state.state) ? "close_cover" : "open_cover";
      } else {
        service = isOnState(state.state) ? "turn_off" : "turn_on";
      }

      // Optimistic update
      const optimistic = {
        ...state,
        state: service.includes("on") || service === "unlock" || service === "open_cover" ? "on" : "off",
      };
      this.states.set(entityId, optimistic);
      this._debouncedRender();

      await this.haConnection.callService(domain, service, serviceData);
    } catch (err) {
      console.error("[HA-board] Toggle error:", err);
      // Revert optimistic update on error
      this._debouncedRender();
    }
  }

  async _activateScene(entityId) {
    if (!this.haConnection?.connected || !entityId) return;
    try {
      await this.haConnection.callService("scene", "turn_on", {
        entity_id: entityId,
      });
      this._showNotification(`Scene activated`);
    } catch (err) {
      console.error("[HA-board] Scene activation error:", err);
    }
  }

  async _activateQuickScene(sceneId) {
    console.log("[HA-board] Quick scene:", sceneId);
    this._showNotification(`${sceneId} scene — link a scene entity in your config`);
  }

  /* ----------------------------------------------------------
     NOTIFICATIONS
     ---------------------------------------------------------- */

  _showNotification(message, type = "info") {
    const existing = document.querySelector(".ha-notification");
    if (existing) existing.remove();

    const notif = document.createElement("div");
    notif.className = `ha-notification ha-notification-${type}`;
    notif.textContent = message;
    document.body.appendChild(notif);

    requestAnimationFrame(() => notif.classList.add("show"));
    setTimeout(() => {
      notif.classList.remove("show");
      setTimeout(() => notif.remove(), 300);
    }, 2500);
  }
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */

let haBoard;

document.addEventListener("DOMContentLoaded", () => {
  haBoard = new HABoard();
  haBoard.init().catch((err) => {
    console.error("[HA-board] Init error:", err);
  });
});
