/**
 * Help / Support API
 *
 * Wraps the help-ticket endpoints. Submitting was already wired; N3 adds the
 * read side (list / detail / replies) and N4 adds requestType to submission.
 */

import apiClient from './client';
import { API_CONFIG } from '../constants/config';
import type { ApiResponse } from '../types';

export interface HelpTicket {
  id: string;
  subject: string;
  category: string;
  status: string;       // OPEN | IN_PROGRESS | WAITING | RESOLVED | CLOSED | REJECTED | CANCELLED
  requestType?: string; // SUPPORT | DISPUTE | CHANGE | OTHER
  createdAt: string;
  updatedAt?: string;
}

export interface HelpReply {
  id: string;
  body: string;
  isAdmin?: boolean; // staff reply (author identity hidden per spec §13.3)
  createdAt: string;
}

function ticketPath(template: string, id: string) {
  return template.replace(':id', encodeURIComponent(id));
}

export const helpApi = {
  /**
   * N4 — submit a ticket including the request type.
   */
  async submitTicket(payload: {
    subject: string;
    body: string;
    category: string;
    requestType?: string;
  }): Promise<ApiResponse<any>> {
    return apiClient.post(API_CONFIG.ENDPOINTS.HELP.SUBMIT_TICKET, payload);
  },

  /**
   * N3 — list the caller's tickets.
   */
  async getTickets(): Promise<ApiResponse<HelpTicket[]>> {
    return apiClient.get(API_CONFIG.ENDPOINTS.HELP.MY_TICKETS);
  },

  /**
   * N3 — single ticket detail.
   */
  async getTicket(id: string): Promise<ApiResponse<HelpTicket>> {
    return apiClient.get(ticketPath(API_CONFIG.ENDPOINTS.HELP.TICKET_BY_ID, id));
  },

  /**
   * N3 — replies (email-threaded) for a ticket.
   */
  async getReplies(id: string): Promise<ApiResponse<HelpReply[]>> {
    return apiClient.get(ticketPath(API_CONFIG.ENDPOINTS.HELP.TICKET_REPLIES, id));
  },

  /**
   * N3 — post a reply to a ticket. Reopens WAITING/RESOLVED tickets server-side.
   */
  async reply(id: string, body: string): Promise<ApiResponse<HelpReply>> {
    return apiClient.post(ticketPath(API_CONFIG.ENDPOINTS.HELP.TICKET_REPLY, id), { body });
  },
};

export default helpApi;
