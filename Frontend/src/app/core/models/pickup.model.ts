// ============================================
// PICKUP MODEL — WasteZero Milestone 3
// Mirrors Backend: models/pickup.model.js
// ============================================

export type PickupStatus = 'Pending' | 'Assigned' | 'Completed' | 'Cancelled' | 'Missed';

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
  missedAt?: string | null;        // set by sweep when status → Missed
  rescheduleCount?: number;        // how many times this pickup has been rescheduled
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
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    pickups: Pickup[];
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
  wasteCollected?: WasteCollectedItem[];
}

/**
 * One entry in the wasteCollected array submitted when the NGO marks
 * a pickup Completed. Mirrors backend validation:
 *   category: must be one of WASTE_TYPES (ALLOWED_WASTE_TYPES on backend)
 *   weight:   positive float > 0, in kilograms
 */
export interface WasteCollectedItem {
  category: string;
  weight: number;
}

/** Full payload for PATCH /:id/status → Completed */
export interface CompletePickupPayload {
  status: 'Completed';
  wasteCollected: WasteCollectedItem[];
}

export interface ReschedulePickupPayload {
  scheduledDate: string;         // YYYY-MM-DD
  preferredTimeSlot: PickupTimeSlot; // { start: HH:mm, end: HH:mm }
}

// ── Waste Type Constants ───────────────────

// Matches backend: Backend/constants/wasteTypes.js ALLOWED_WASTE_TYPES
export const WASTE_TYPES: string[] = [
  'Plastic',
  'Paper',
  'Glass',
  'E-Waste',
  'Organic',
  'Metal',
];
