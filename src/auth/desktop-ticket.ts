import crypto from 'node:crypto';
import type { AuthSession } from './session.js';

interface DesktopTicket {
  status: 'pending' | 'complete';
  session?: AuthSession;
  expiresAt: number;
  deviceCode?: string;
  userCode?: string;
  pollInterval?: number;
}

const tickets = new Map<string, DesktopTicket>();

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, ticket] of tickets) {
    if (ticket.expiresAt <= now) tickets.delete(id);
  }
}

export function createDesktopTicket(ttlMs = DEFAULT_TTL_MS): string {
  pruneExpired();
  const ticket = crypto.randomUUID().replace(/-/g, '');
  tickets.set(ticket, {
    status: 'pending',
    expiresAt: Date.now() + ttlMs,
  });
  return ticket;
}

export function getDesktopTicket(ticket: string): DesktopTicket | undefined {
  pruneExpired();
  const entry = tickets.get(ticket);
  if (!entry || entry.expiresAt <= Date.now()) {
    tickets.delete(ticket);
    return undefined;
  }
  return entry;
}

export function completeDesktopTicket(
  ticket: string,
  session: AuthSession,
): boolean {
  const entry = getDesktopTicket(ticket);
  if (!entry || entry.status !== 'pending') return false;
  entry.status = 'complete';
  entry.session = session;
  return true;
}

export function consumeDesktopTicketSession(
  ticket: string,
): AuthSession | undefined {
  const entry = getDesktopTicket(ticket);
  if (!entry || entry.status !== 'complete' || !entry.session) return undefined;
  tickets.delete(ticket);
  return entry.session;
}

export function attachDesktopTicketDevice(
  ticket: string,
  deviceCode: string,
  userCode: string,
  pollInterval: number,
): boolean {
  const entry = getDesktopTicket(ticket);
  if (!entry || entry.status !== 'pending') return false;
  entry.deviceCode = deviceCode;
  entry.userCode = userCode;
  entry.pollInterval = pollInterval;
  return true;
}

export const desktopTicketTtlMs = DEFAULT_TTL_MS;
