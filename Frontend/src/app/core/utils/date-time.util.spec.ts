import { format12HourTime, formatTimeOnly, formatDateTime12, formatTimeSlot } from './date-time.util';

describe('DateTimeUtil', () => {
  describe('format12HourTime', () => {
    it('should format 00:00 to 12:00 AM', () => {
      expect(format12HourTime('00:00')).toBe('12:00 AM');
    });

    it('should format 00:15 to 12:15 AM', () => {
      expect(format12HourTime('00:15')).toBe('12:15 AM');
    });

    it('should format 09:05 to 9:05 AM', () => {
      expect(format12HourTime('09:05')).toBe('9:05 AM');
    });

    it('should format 11:59 to 11:59 AM', () => {
      expect(format12HourTime('11:59')).toBe('11:59 AM');
    });

    it('should format 12:00 to 12:00 PM', () => {
      expect(format12HourTime('12:00')).toBe('12:00 PM');
    });

    it('should format 12:30 to 12:30 PM', () => {
      expect(format12HourTime('12:30')).toBe('12:30 PM');
    });

    it('should format 15:30 to 3:30 PM', () => {
      expect(format12HourTime('15:30')).toBe('3:30 PM');
    });

    it('should format 23:59 to 11:59 PM', () => {
      expect(format12HourTime('23:59')).toBe('11:59 PM');
    });

    it('should handle empty, null or undefined input safely', () => {
      expect(format12HourTime('')).toBe('');
      expect(format12HourTime(null)).toBe('');
      expect(format12HourTime(undefined)).toBe('');
    });

    it('should return already formatted 12-hour strings unchanged', () => {
      expect(format12HourTime('3:30 PM')).toBe('3:30 PM');
      expect(format12HourTime('9:05 AM')).toBe('9:05 AM');
    });
  });

  describe('formatTimeSlot', () => {
    it('should format time slot range in 12-hour format', () => {
      const slot = { start: '09:00', end: '11:30' };
      expect(formatTimeSlot(slot)).toBe('9:00 AM – 11:30 AM');
    });

    it('should format afternoon time slots in 12-hour format', () => {
      const slot = { start: '14:00', end: '16:30' };
      expect(formatTimeSlot(slot)).toBe('2:00 PM – 4:30 PM');
    });

    it('should handle display overrides if present', () => {
      const slot = { start: '14:00', end: '16:30', startDisplay: '14:00', endDisplay: '16:30' };
      expect(formatTimeSlot(slot)).toBe('2:00 PM – 4:30 PM');
    });

    it('should handle null or undefined slot safely', () => {
      expect(formatTimeSlot(null)).toBe('');
      expect(formatTimeSlot(undefined)).toBe('');
    });
  });

  describe('formatDateTime12', () => {
    it('should format valid ISO strings with 12-hour time', () => {
      const formatted = formatDateTime12('2026-08-19T15:30:00Z');
      expect(formatted).toMatch(/\b(AM|PM)\b/i);
    });

    it('should handle invalid date input safely', () => {
      expect(formatDateTime12('')).toBe('');
      expect(formatDateTime12(null)).toBe('');
      expect(formatDateTime12(undefined)).toBe('');
    });
  });
});
