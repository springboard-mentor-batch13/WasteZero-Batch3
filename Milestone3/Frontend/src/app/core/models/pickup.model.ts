// ============================================
// PICKUP MODEL — WasteZero Milestone 3
// Mirrors Backend: models/pickup.model.js
// ============================================

export type PickupStatus = 'Pending' | 'Assigned' | 'Completed' | 'Cancelled';

export interface PickupAddress {
  area?: string;
  city: string;
}

export interface PickupTimeSlot {
  start: string;   // HH:mm 24-hour
  end: string;     // HH:mm 24-hour
}

export interface VolunteerRef {
  _id: string;
  name: string;
  username?: string;
  email: string;
}

export interface NgoRef {
  _id: string;
  name: string;
  username?: string;
  email: string;
}

export interface Pickup {
  _id: string;
  user_id: string | VolunteerRef;   // backend field: volunteer who created the pickup
  agent_id?: string | NgoRef | null; // backend field: NGO who accepted it
  address: PickupAddress;
  scheduledDate: string;           // ISO 8601
  preferredTimeSlot: PickupTimeSlot;
  wasteTypes: string[];
  notes?: string | null;
  status: PickupStatus;
  createdAt: string;
  updatedAt: string;
}

// ── API Response Shapes ────────────────────

export interface PickupResponse {
  success: boolean;
  message: string;
  data: Pickup;
}

export interface PickupArrayResponse {
  success: boolean;
  message: string;
  data: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    pickups: Pickup[];
  };
}

export interface PickupListResponse {
  success: boolean;
  message: string;
  data: {
    pickups: Pickup[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

// ── Form Payload Shapes ────────────────────

export interface CreatePickupPayload {
  address: PickupAddress;
  scheduledDate: string;
  preferredTimeSlot: PickupTimeSlot;
  wasteTypes: string[];
  notes?: string | null;
}

export interface UpdatePickupPayload {
  address?: PickupAddress;
  scheduledDate?: string;
  preferredTimeSlot?: PickupTimeSlot;
  wasteTypes?: string[];
  notes?: string | null;
}

export interface UpdatePickupStatusPayload {
  status: 'Assigned' | 'Completed' | 'Cancelled';
}

// ── Waste Type Constants ───────────────────

export const WASTE_TYPES: string[] = [
  'Plastic',
  'Paper',
  'Glass',
  'Metal',
  'Electronic Waste',
  'Organic Waste',
  'Other',
];
