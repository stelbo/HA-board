"""Config flow for HA-board."""
import logging
from typing import Any, Dict, Optional

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

_LOGGER = logging.getLogger(__name__)

DOMAIN = "ha_board"


class HABoardConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for HA-board."""

    VERSION = 1

    async def async_step_user(
        self, user_input: Optional[Dict[str, Any]] = None
    ) -> FlowResult:
        """Handle the initial step."""
        if user_input is not None:
            await self.async_set_unique_id("ha_board")
            self._abort_if_unique_id_configured()

            return self.async_create_entry(
                title=user_input.get("name", "HA-board Dashboard"),
                data=user_input,
            )

        schema = vol.Schema(
            {
                vol.Required("name", default="HA-board"): str,
            }
        )

        return self.async_show_form(step_id="user", data_schema=schema)

    async def async_step_import(self, import_data: Dict[str, Any]) -> FlowResult:
        """Handle import from YAML."""
        return await self.async_step_user(import_data)
