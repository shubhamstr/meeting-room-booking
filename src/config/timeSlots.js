/**
 * Static Time Slots Definition
 * Replaces the database time_slots table with high-performance in-memory definitions.
 */

export const STATIC_TIME_SLOTS = [
  { id: '09:00-10:00', label: '09:00 AM - 10:00 AM', startTime: '09:00', endTime: '10:00', time: '09:00 AM', period: 'Morning', sortOrder: 1 },
  { id: '10:00-11:00', label: '10:00 AM - 11:00 AM', startTime: '10:00', endTime: '11:00', time: '10:00 AM', period: 'Morning', sortOrder: 2 },
  { id: '11:00-12:00', label: '11:00 AM - 12:00 PM', startTime: '11:00', endTime: '12:00', time: '11:00 AM', period: 'Morning', sortOrder: 3 },
  { id: '12:00-13:00', label: '12:00 PM - 01:00 PM', startTime: '12:00', endTime: '13:00', time: '12:00 PM', period: 'Afternoon', sortOrder: 4 },
  { id: '13:00-14:00', label: '01:00 PM - 02:00 PM', startTime: '13:00', endTime: '14:00', time: '01:00 PM', period: 'Afternoon', sortOrder: 5 },
  { id: '14:00-15:00', label: '02:00 PM - 03:00 PM', startTime: '14:00', endTime: '15:00', time: '02:00 PM', period: 'Afternoon', sortOrder: 6 },
  { id: '15:00-16:00', label: '03:00 PM - 04:00 PM', startTime: '15:00', endTime: '16:00', time: '03:00 PM', period: 'Afternoon', sortOrder: 7 },
  { id: '16:00-17:00', label: '04:00 PM - 05:00 PM', startTime: '16:00', endTime: '17:00', time: '04:00 PM', period: 'Evening', sortOrder: 8 },
  { id: '17:00-18:00', label: '05:00 PM - 06:00 PM', startTime: '17:00', endTime: '18:00', time: '05:00 PM', period: 'Evening', sortOrder: 9 }
];

/**
 * Format a 24-hour time string like "09:00" to "09:00 AM"
 */
export function formatTime12h(time24) {
  if (!time24) return '';
  const parts = String(time24).split(':');
  let hour = parseInt(parts[0], 10);
  const min = parts[1] || '00';
  if (isNaN(hour)) return time24;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(displayHour).padStart(2, '0')}:${min} ${period}`;
}

/**
 * Find static slot by id, label, or time
 */
export function findSlot(identifier) {
  if (!identifier) return null;
  const idStr = String(identifier).trim().toLowerCase();
  return STATIC_TIME_SLOTS.find(
    s => s.id.toLowerCase() === idStr || 
         s.label.toLowerCase() === idStr || 
         s.startTime === idStr || 
         s.id.startsWith(idStr + '-')
  ) || null;
}
