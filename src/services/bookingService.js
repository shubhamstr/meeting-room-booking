import { initialCustomers, initialRooms, allTimeSlots, initialBookings, getTodayDateString } from '../data/mockData.js';

class BookingService {
  constructor() {
    this.customers = [...initialCustomers];
    this.rooms = [...initialRooms];
    this.bookings = [...initialBookings];
    this.slots = [...allTimeSlots];
  }

  // --- Customer Operations ---
  getCustomers(searchQuery = '') {
    if (!searchQuery.trim()) {
      return this.customers.map(c => ({
        ...c,
        bookingCount: this.bookings.filter(b => b.customerId === c.id && b.status !== 'Cancelled').length
      }));
    }
    const q = searchQuery.toLowerCase().trim();
    return this.customers
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.department.toLowerCase().includes(q)
      )
      .map(c => ({
        ...c,
        bookingCount: this.bookings.filter(b => b.customerId === c.id && b.status !== 'Cancelled').length
      }));
  }

  getCustomerById(id) {
    return this.customers.find(c => c.id === id) || null;
  }

  addCustomer({ name, email, phone, company, department }) {
    const safeName = String(name || '').trim();
    const safeEmail = String(email || '').trim();
    const safePhone = phone ? String(phone).trim() : '+1 (555) 000-0000';
    const safeCompany = company ? (typeof company === 'object' ? (company.name || company.value || 'Independent Corp') : String(company).trim()) : 'Independent Corp';
    const safeDept = department ? (typeof department === 'object' ? (department.name || department.value || 'General') : String(department).trim()) : 'General';

    const initials = safeName
      .split(' ')
      .filter(Boolean)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const colors = ['#6366f1', '#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newCustomer = {
      id: `cust-${Date.now()}`,
      name: safeName,
      email: safeEmail,
      phone: safePhone,
      company: safeCompany,
      department: safeDept,
      avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
      initials: initials || 'CU',
      badgeColor: randomColor
    };

    this.customers.unshift(newCustomer);
    return newCustomer;
  }

  // --- Room Operations ---
  getRooms(minCapacity = 0) {
    if (minCapacity > 0) {
      return this.rooms.filter(r => r.capacity >= minCapacity);
    }
    return this.rooms;
  }

  getRoomById(id) {
    return this.rooms.find(r => r.id === id) || null;
  }

  // --- Slots & Availability ---
  getAllSlots() {
    return this.slots;
  }

  getSlotsWithAvailability(roomId, date) {
    const targetDate = date || getTodayDateString(0);
    const existingBookings = this.bookings.filter(
      b => b.roomId === roomId && b.date === targetDate && b.status !== 'Cancelled'
    );

    const bookedSlotIds = new Set(existingBookings.map(b => b.slotId));

    return this.slots.map(slot => {
      const isBooked = bookedSlotIds.has(slot.id);
      const bookingInfo = isBooked
        ? existingBookings.find(b => b.slotId === slot.id)
        : null;

      return {
        ...slot,
        isAvailable: !isBooked,
        bookedBy: bookingInfo ? bookingInfo.customerName : null,
        bookingTitle: bookingInfo ? bookingInfo.title : null
      };
    });
  }

  // --- Booking Operations ---
  createBooking({ customerId, roomId, date, slotId, title, attendees, notes }) {
    const customer = this.getCustomerById(customerId);
    if (!customer) {
      throw new Error('Customer not found. Please pick or register a valid customer.');
    }

    const room = this.getRoomById(roomId);
    if (!room) {
      throw new Error('Meeting room not found.');
    }

    const slot = this.slots.find(s => s.id === slotId);
    if (!slot) {
      throw new Error('Invalid time slot selected.');
    }

    // Check slot collision
    const isConflict = this.bookings.some(
      b => b.roomId === roomId && b.date === date && b.slotId === slotId && b.status !== 'Cancelled'
    );

    if (isConflict) {
      throw new Error(`Room "${room.name}" is already booked for ${slot.label} on ${date}.`);
    }

    const newBooking = {
      id: `BK-${Math.floor(1000 + Math.random() * 9000)}`,
      customerId: customer.id,
      customerName: customer.name,
      customerCompany: customer.company,
      roomId: room.id,
      roomName: room.name,
      date,
      slotId: slot.id,
      slotLabel: slot.label,
      title: title?.trim() || `Team Sync - ${customer.company}`,
      attendees: parseInt(attendees, 10) || 2,
      notes: notes?.trim() || '',
      totalCost: room.hourlyRate,
      status: 'Confirmed',
      googleEventId: null,
      createdAt: new Date().toISOString()
    };

    this.bookings.unshift(newBooking);
    return newBooking;
  }

  updateBooking(bookingId, updates = {}) {
    const booking = this.bookings.find(b => b.id === bookingId);
    if (!booking) {
      throw new Error('Booking not found.');
    }
    Object.assign(booking, updates);
    return booking;
  }

  cancelBooking(bookingId) {
    const booking = this.bookings.find(b => b.id === bookingId);
    if (!booking) {
      throw new Error('Booking not found.');
    }
    booking.status = 'Cancelled';
    return booking;
  }

  getBookings({ search = '', customerId = '', roomId = '', status = '', date = '' } = {}) {
    return this.bookings.filter(b => {
      if (customerId && b.customerId !== customerId) return false;
      if (roomId && b.roomId !== roomId) return false;
      if (status && b.status.toLowerCase() !== status.toLowerCase()) return false;
      if (date && b.date !== date) return false;
      if (search) {
        const q = search.toLowerCase().trim();
        const matchesTitle = b.title.toLowerCase().includes(q);
        const matchesCustomer = b.customerName.toLowerCase().includes(q);
        const matchesRoom = b.roomName.toLowerCase().includes(q);
        const matchesId = b.id.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCustomer && !matchesRoom && !matchesId) {
          return false;
        }
      }
      return true;
    });
  }

  getStats() {
    const today = getTodayDateString(0);
    const todayBookings = this.bookings.filter(b => b.date === today && b.status !== 'Cancelled');
    const totalRevenue = this.bookings
      .filter(b => b.status === 'Confirmed')
      .reduce((sum, b) => sum + (b.totalCost || 0), 0);

    return {
      totalCustomers: this.customers.length,
      totalRooms: this.rooms.length,
      activeBookings: this.bookings.filter(b => b.status === 'Confirmed').length,
      todayBookingsCount: todayBookings.length,
      totalRevenue
    };
  }
}

export const bookingService = new BookingService();
