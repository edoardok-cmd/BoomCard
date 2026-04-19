import type { Server as SocketServer } from 'socket.io';

/**
 * Module-level holder for the Socket.IO server instance.
 *
 * server.ts calls setIO() once after constructing the server; downstream
 * modules (notification.service, etc.) call getIO() to broadcast events.
 * This avoids passing `io` through every call site or creating an import
 * cycle between server.ts and the services it consumes.
 */
let ioInstance: SocketServer | null = null;

export function setIO(io: SocketServer): void {
  ioInstance = io;
}

export function getIO(): SocketServer | null {
  return ioInstance;
}

/**
 * Push a notification to a specific user's notification room.
 * No-op (with a debug log) if WebSocket isn't initialized yet — happens in
 * unit tests and during early startup before initializeWebSocket runs.
 */
export function emitNotification(userId: string, payload: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(`notifications:${userId}`).emit('notification', payload);
}
