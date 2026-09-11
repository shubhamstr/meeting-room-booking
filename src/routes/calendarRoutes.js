import { Router } from 'express';
import { googleCalendarService } from '../services/googleCalendarService.js';
import { bookingService } from '../services/bookingService.js';

const router = Router();

// Helper to check if caller wants JSON
const wantsJson = (req) => {
  return req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
};

// 1. Initiate Google Calendar OAuth Flow
router.get('/connect', (req, res) => {
  try {
    const host = req.get('host');
    const protocol = req.protocol;
    const defaultRedirectUri = `${protocol}://${host}/api/calendar/callback`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri;

    const authUrl = googleCalendarService.getAuthUrl(redirectUri);

    if (wantsJson(req)) {
      return res.json({ success: true, authUrl, redirectUri });
    }

    res.redirect(authUrl);
  } catch (err) {
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect('/customers?error=' + encodeURIComponent('Failed to initiate Google Calendar connection: ' + err.message));
  }
});

// 2. Google OAuth Callback (also handles token exchange)
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    const msg = `Google Auth Error: ${error} - ${error_description || 'Access denied'}`;
    if (wantsJson(req)) {
      return res.status(400).json({ success: false, error: msg });
    }
    return res.redirect('/customers?error=' + encodeURIComponent(msg));
  }

  if (!code) {
    const msg = 'Authorization code was not returned by Google.';
    if (wantsJson(req)) {
      return res.status(400).json({ success: false, error: msg });
    }
    return res.redirect('/customers?error=' + encodeURIComponent(msg));
  }

  try {
    const host = req.get('host');
    const protocol = req.protocol;
    const defaultRedirectUri = `${protocol}://${host}/api/calendar/callback`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri;

    const tokenData = await googleCalendarService.handleOAuthCallback(code, redirectUri);
    const email = tokenData.userEmail ? ` (${tokenData.userEmail})` : '';

    if (wantsJson(req)) {
      return res.json({
        success: true,
        message: `Successfully connected Google Calendar${email}!`,
        data: googleCalendarService.getConnectionStatus()
      });
    }

    res.redirect('/customers?success=' + encodeURIComponent(`Successfully connected Google Calendar${email}!`));
  } catch (err) {
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect('/customers?error=' + encodeURIComponent('Google Calendar Connection Failed: ' + err.message));
  }
});

// 3. Calendar Connection Status
router.get('/status', (req, res) => {
  const status = googleCalendarService.getConnectionStatus();
  res.json({
    success: true,
    data: status
  });
});

// 4. Disconnect Google Calendar (POST & GET)
const handleCalendarDisconnect = (req, res) => {
  try {
    googleCalendarService.disconnect();

    if (wantsJson(req)) {
      return res.json({ success: true, message: 'Google Calendar has been disconnected.' });
    }

    res.redirect('/customers?success=' + encodeURIComponent('Google Calendar has been disconnected.'));
  } catch (err) {
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect('/customers?error=' + encodeURIComponent(err.message));
  }
};

router.post('/disconnect', handleCalendarDisconnect);
router.get('/disconnect', handleCalendarDisconnect);

// 5. List Upcoming Google Calendar Events
router.get('/events', async (req, res) => {
  try {
    if (!googleCalendarService.isConnected()) {
      return res.status(400).json({
        success: false,
        error: 'Google Calendar is not connected.'
      });
    }

    const limit = parseInt(req.query.limit, 10) || 20;
    const events = await googleCalendarService.listCalendarEvents(limit);
    res.json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Create Calendar Event
router.post('/events', async (req, res) => {
  try {
    if (!googleCalendarService.isConnected()) {
      return res.status(400).json({
        success: false,
        error: 'Google Calendar is not connected.'
      });
    }

    const { title, roomName, customerName, customerCompany, date, slotLabel, notes, attendees } = req.body;
    if (!date || !slotLabel || !roomName) {
      return res.status(400).json({
        success: false,
        error: 'Required fields missing: date, slotLabel, and roomName are required.'
      });
    }

    const mockBooking = {
      id: req.body.bookingId || `EVT-${Date.now()}`,
      title: title || `Room Reservation - ${roomName}`,
      roomName,
      customerName: customerName || 'Admin User',
      customerCompany: customerCompany || 'Company',
      date,
      slotLabel,
      notes: notes || '',
      attendees: attendees || 2
    };

    const event = await googleCalendarService.createCalendarEvent(mockBooking);
    res.status(201).json({
      success: true,
      message: 'Event created in Google Calendar!',
      data: event
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Delete Calendar Event
router.delete('/events/:eventId', async (req, res) => {
  try {
    if (!googleCalendarService.isConnected()) {
      return res.status(400).json({
        success: false,
        error: 'Google Calendar is not connected.'
      });
    }

    const { eventId } = req.params;
    await googleCalendarService.deleteCalendarEvent(eventId);

    res.json({
      success: true,
      message: `Event ${eventId} deleted from Google Calendar.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Bulk Sync Local Confirmed Bookings to Google Calendar (POST & GET)
const handleCalendarSync = async (req, res) => {
  try {
    if (!googleCalendarService.isConnected()) {
      const msg = 'Please connect Google Calendar first before syncing.';
      if (wantsJson(req)) {
        return res.status(400).json({ success: false, error: msg });
      }
      return res.redirect('/customers?error=' + encodeURIComponent(msg));
    }

    const confirmedBookings = bookingService.getBookings({ status: 'Confirmed' });
    let syncedCount = 0;
    const errors = [];

    for (const booking of confirmedBookings) {
      if (!booking.googleEventId) {
        try {
          const calEvent = await googleCalendarService.createCalendarEvent(booking);
          if (calEvent && calEvent.id) {
            bookingService.updateBooking(booking.id, { googleEventId: calEvent.id });
            syncedCount++;
          }
        } catch (syncErr) {
          errors.push({ bookingId: booking.id, error: syncErr.message });
        }
      }
    }

    const msg = `Synced ${syncedCount} bookings to Google Calendar!`;
    if (wantsJson(req)) {
      return res.json({
        success: true,
        message: msg,
        syncedCount,
        errors: errors.length ? errors : undefined
      });
    }

    res.redirect('/customers?success=' + encodeURIComponent(msg));
  } catch (err) {
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect('/customers?error=' + encodeURIComponent('Calendar Sync Failed: ' + err.message));
  }
};

router.post('/sync', handleCalendarSync);
router.get('/sync', handleCalendarSync);

export default router;
