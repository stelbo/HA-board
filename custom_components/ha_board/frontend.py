"""Frontend platform for HA-board."""
import logging

from homeassistant.components.frontend import async_register_built_in_panel
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

DOMAIN = "ha_board"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up HA-board frontend."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HA-board frontend from config entry."""
    _LOGGER.debug("Setting up HA-board frontend")

    try:
        await async_register_built_in_panel(
            hass,
            "ha-board",
            "HA-board Dashboard",
            "mdi:home-dashboard",
            "ha_board",
            config=entry.data,
        )
        _LOGGER.info("HA-board frontend registered successfully")
        return True
    except Exception as err:
        _LOGGER.error("Error registering HA-board frontend: %s", err)
        return False


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload HA-board frontend."""
    _LOGGER.debug("Unloading HA-board frontend")
    return True
