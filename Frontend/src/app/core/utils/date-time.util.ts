/**
 * Centralized presentation-layer Date and Time formatting utilities for WasteZero.
 *
 * Ensures all user-facing times are formatted in 12-hour AM/PM format (e.g. "3:30 PM", "9:05 AM", "12:15 AM", "12:00 PM").
 * Does NOT alter ISO timestamps or raw API/DB representations.
 */

/**
 * Converts a 24-hour "HH:mm" or "H:mm" time string into 12-hour "h:mm A" display string.
 *
 * Test cases:
 *  - "00:00" -> "12:00 AM"
 *  - "00:15" -> "12:15 AM"
 *  - "09:05" -> "9:05 AM"
 *  - "11:59" -> "11:59 AM"
 *  - "12:00" -> "12:00 PM"
 *  - "12:30" -> "12:30 PM"
 *  - "15:30" -> "3:30 PM"
 *  - "23:59" -> "11:59 PM"
 *
 * @param timeStr - Raw time string like "15:30" or "09:05"
 * @returns Formatted 12-hour time string with AM/PM
 */
export function format12HourTime(timeStr?: string | null): string {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const trimmed = timeStr.trim();
  if (!trimmed) return '';

  // If already formatted with AM/PM, return as is
  if (/\b(am|pm)\b/i.test(trimmed)) {
    return trimmed;
  }

  // Match HH:mm or H:mm with optional seconds
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return trimmed;

  const hours24 = parseInt(match[1], 10);
  const minutes = match[2];
  if (isNaN(hours24) || hours24 < 0 || hours24 > 23) return trimmed;

  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12; // 0 -> 12, 13 -> 1, etc.

  return `${hours12}:${minutes} ${period}`;
}

/**
 * Formats a Date object or ISO date string to a 12-hour time string (e.g. "3:30 PM", "9:05 AM").
 *
 * @param dateInput - Date object, ISO timestamp string, or time string
 * @returns 12-hour formatted time with AM/PM
 */
export function formatTimeOnly(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  try {
    if (typeof dateInput === 'string' && /^([01]?\d|2[0-3]):[0-5]\d/.test(dateInput.trim())) {
      return format12HourTime(dateInput);
    }
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return typeof dateInput === 'string' ? format12HourTime(dateInput) : '';

    return d.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return '';
  }
}

/**
 * Formats a Date object or ISO date string to a readable date and 12-hour time (e.g. "Aug 19, 2026, 3:30 PM").
 *
 * @param dateInput - Date object or ISO timestamp string
 * @param options - Optional custom Intl.DateTimeFormatOptions
 * @returns Formatted date and 12-hour time string
 */
export function formatDateTime12(
  dateInput?: string | Date | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return '';
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);

    const defaultOptions: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...options
    };

    return d.toLocaleString([], defaultOptions);
  } catch {
    return String(dateInput);
  }
}

/**
 * Formats a preferred time slot object into a 12-hour range string (e.g. "9:00 AM – 11:30 AM").
 *
 * @param slot - Time slot with start and end times (e.g. { start: "09:00", end: "11:30", startDisplay?, endDisplay? })
 * @returns Formatted time slot range
 */
export function formatTimeSlot(
  slot?: { start?: string; end?: string; startDisplay?: string; endDisplay?: string } | null
): string {
  if (!slot) return '';
  const start = slot.startDisplay ? format12HourTime(slot.startDisplay) : format12HourTime(slot.start);
  const end = slot.endDisplay ? format12HourTime(slot.endDisplay) : format12HourTime(slot.end);

  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}
