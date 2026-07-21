// ============================================
// APPLICATION MODEL — WasteZero Milestone 2
// Mirrors Backend: models/application.model.js
// ============================================

import { Opportunity } from './opportunity.model';

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';

export interface VolunteerRef {
  _id: string;
  name: string;
  email: string;
}

export interface Application {
  _id: string;
  opportunity_id: string | Opportunity;
  volunteer_id: string | VolunteerRef;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

// ── API Response Shapes ────────────────────

export interface ApplicationResponse {
  success: boolean;
  message: string;
  data: Application;
}

export interface ApplicationListResponse {
  success: boolean;
  message: string;
  data: {
    page: number;
    limit: number;
    applications: Application[];
  };
}

export interface MyApplicationsResponse {
  success: boolean;
  message: string;
  data: Application[];
}

// ── Request Payload Shapes ─────────────────

export interface ApplyPayload {
  opportunity_id: string;
}

export interface UpdateStatusPayload {
  status: 'accepted' | 'rejected';
}
