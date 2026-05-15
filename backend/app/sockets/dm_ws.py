"""Native WebSocket manager for Direct Message channels."""
import asyncio
from typing import Dict, Set, Tuple
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class DMConnectionManager:
    """
    Manages native WebSocket connections for DM channels.
    Each DM channel has a set of connected WebSocket clients.
    """

    def __init__(self):
        # channel_id -> set of (websocket, user_id) tuples
        self.channels: Dict[str, Set[Tuple[WebSocket, str]]] = {}

    async def connect(self, websocket: WebSocket, channel_id: str, user_id: str):
        if channel_id not in self.channels:
            self.channels[channel_id] = set()
        self.channels[channel_id].add((websocket, user_id))
        logger.info(f"[DM-WS] Client {user_id} connected to channel {channel_id}. Total: {len(self.channels[channel_id])}")

    def disconnect(self, websocket: WebSocket, channel_id: str):
        if channel_id in self.channels:
            self.channels[channel_id] = {(ws, uid) for ws, uid in self.channels[channel_id] if ws != websocket}
            if not self.channels[channel_id]:
                del self.channels[channel_id]
        logger.info(f"[DM-WS] Client disconnected from channel {channel_id}")

    async def broadcast(self, channel_id: str, message: dict):
        """Broadcast a message to all clients in a DM channel."""
        if channel_id not in self.channels:
            return

        # If message has sender_id, skip broadcasting to the sender
        sender_id = message.get("sender_id", None)
        dead_connections: Set[WebSocket] = set()

        for ws, uid in list(self.channels[channel_id]):
            if sender_id and uid == sender_id:
                continue  # Don't echo back to sender
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"[DM-WS] Failed to send to a client, removing. Error: {e}")
                dead_connections.add(ws)

        # Clean up dead connections
        for ws in dead_connections:
            self.channels[channel_id] = {(w, u) for w, u in self.channels[channel_id] if w != ws}


# Singleton instance — shared across the entire app
dm_ws_manager = DMConnectionManager()