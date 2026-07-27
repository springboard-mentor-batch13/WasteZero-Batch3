// ============================================
// OPPORTUNITY MODEL — WasteZero Milestone 2
// Mirrors Backend: models/opportunity.model.js
// ============================================

export type OpportunityStatus = 'open' | 'in-progress' | 'closed';

export interface NgoRef {
  _id: string;
  name: string;
  email: string;
}

export interface Opportunity {
  _id: string;
  ngo_id: string | NgoRef;
  title: string;
  description: string;
  required_skills: string[];
  duration: string;
  location: string;
  image: string;
  imagePublicId?: string;
  status: OpportunityStatus;
  date?: string | null;    // ISO 8601 event date (optional)
  createdAt: string;
  updatedAt: string;
}

// ── API Response Shapes ────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface OpportunityListData {
  opportunities: Opportunity[];
  pagination: PaginationMeta;
}

export interface OpportunityListResponse {
  success: boolean;
  message: string;
  data: OpportunityListData;
}

export interface OpportunityResponse {
  success: boolean;
  message: string;
  data: Opportunity;
}

export interface OpportunityArrayResponse {
  success: boolean;
  message: string;
  data: Opportunity[];
}

// ── Form Payload Shape ─────────────────────

export interface CreateOpportunityPayload {
  title: string;
  description: string;
  required_skills: string[];
  duration: string;
  location: string;
  status?: OpportunityStatus;
  image?: string;
  date?: string | null;    // ISO 8601 event date (optional)
}

export interface UpdateOpportunityPayload {
  title?: string;
  description?: string;
  required_skills?: string[];
  duration?: string;
  location?: string;
  status?: OpportunityStatus;
  image?: string;
  date?: string | null;    // ISO 8601 event date (optional)
}
