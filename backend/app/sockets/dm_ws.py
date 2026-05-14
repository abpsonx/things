"""Native WebSocket manager for Direct Message channels."""
import asyncio
from typing import Dict, Set
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class DMConnectionManager:
    """
    Manages native WebSocket connections for DM channels.
    Each DM channel has a set of connected WebSocket clients.
    """

    def __init__(self):
        # channel_id -> set of WebSocket connections
        self.channels: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel_id: str):
        await websocket.accept()
        if channel_id not in self.channels:
            self.channels[channel_id] = set()
        self.channels[channel_id].add(websocket)
        logger.info(f"[DM-WS] Client connected to channel {channel_id}. Total: {len(self.channels[channel_id])}")

    def disconnect(self, websocket: WebSocket, channel_id: str):
        if channel_id in self.channels:
            self.channels[channel_id].discard(websocket)
            if not self.channels[channel_id]:
                del self.channels[channel_id]
        logger.info(f"[DM-WS] Client disconnected from channel {channel_id}")

    async def broadcast(self, channel_id: str, message: dict):
        """Broadcast a message to all clients in a DM channel."""
        if channel_id not in self.channels:
            return

        dead_connections: Set[WebSocket] = set()

        for ws in list(self.channels[channel_id]):
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"[DM-WS] Failed to send to a client, removing. Error: {e}")
                dead_connections.add(ws)

        # Clean up dead connections
        for ws in dead_connections:
            self.channels[channel_id].discard(ws)


# Singleton instance — shared across the entire app
dm_ws_manager = DMConnectionManager()
