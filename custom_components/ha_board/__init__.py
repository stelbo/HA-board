"""HA-board - Premium Smart Home Dashboard for Home Assistant."""
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

DOMAIN = "ha_board"
VERSION = "2.0.0"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up HA-board from YAML (legacy support)."""
    _LOGGER.debug("Setting up HA-board from YAML")
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HA-board from config entry."""
    _LOGGER.debug("Setting up HA-board config entry: %s", entry.entry_id)

    try:
        hass.data[DOMAIN][entry.entry_id] = {
            "name": entry.title,
            "config": entry.data,
        }

        _LOGGER.info("HA-board setup complete")
        return True
    except Exception as err:
        _LOGGER.error("Error setting up HA-board: %s", err)
        return False


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    _LOGGER.debug("Unloading HA-board entry: %s", entry.entry_id)

    try:
        if entry.entry_id in hass.data[DOMAIN]:
            hass.data[DOMAIN].pop(entry.entry_id)

        return True
    except Exception as err:
        _LOGGER.error("Error unloading HA-board: %s", err)
        return False


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Reload a config entry."""
    _LOGGER.debug("Reloading HA-board entry: %s", entry.entry_id)

    await async_unload_entry(hass, entry)
    return await async_setup_entry(hass, entry)
