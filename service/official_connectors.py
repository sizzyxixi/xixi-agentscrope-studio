"""Platform-maintained connector definitions, never account-supplied resource IDs.

Add public service definitions here when the platform publishes connectors.
Per-user credentials and private MCP endpoints must not be placed in templates.
"""
OFFICIAL_CONNECTORS: dict[str, dict] = {}


def catalog():
    return [{"id": identity, **definition} for identity, definition in OFFICIAL_CONNECTORS.items() if definition.get('enabled')]
