import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const storageDir = path.join(rootDir, 'storage');
const tokenFilePath = path.join(storageDir, 'google_calendar_tokens.json');

class GoogleCalendarService {
  constructor() {
    this.tokens = null;
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/calendar/callback';
    this.scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    this._autoLoadClientSecretJson();
    this._loadTokens();
  }

  _autoLoadClientSecretJson() {
    try {
      if (this.clientId && this.clientSecret) return;

      const files = fs.readdirSync(rootDir);
      const secretFile = files.find(f => f.startsWith('client_secret_') && f.endsWith('.json'));
      if (secretFile) {
        const content = JSON.parse(fs.readFileSync(path.join(rootDir, secretFile), 'utf-8'));
        const creds = content.web || content.installed || {};
        if (creds.client_id) this.clientId = creds.client_id;
        if (creds.client_secret) this.clientSecret = creds.client_secret;
        if (creds.redirect_uris && creds.redirect_uris.length > 0) {
          this.redirectUri = creds.redirect_uris[0];
        }
      }
    } catch (err) {
      console.warn('Could not auto-load client_secret.json:', err.message);
    }
  }

  _loadTokens() {
    try {
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      if (fs.existsSync(tokenFilePath)) {
        const raw = fs.readFileSync(tokenFilePath, 'utf-8');
        this.tokens = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Could not load google calendar tokens:', err.message);
      this.tokens = null;
    }
  }

  _saveTokens(tokens) {
    try {
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      this.tokens = {
        ...this.tokens,
        ...tokens,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(tokenFilePath, JSON.stringify(this.tokens, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save google calendar tokens:', err.message);
    }
  }

  getAuthUrl(customRedirectUri) {
    if (!this.clientId) {
      this._autoLoadClientSecretJson();
    }
    if (!this.clientId) {
      throw new Error('Google Client ID is missing. Configure GOOGLE_CLIENT_ID or client_secret.json');
    }

    const redirect = customRedirectUri || this.redirectUri;
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleOAuthCallback(code, customRedirectUri) {
    if (!code) throw new Error('Authorization code is required');
    if (!this.clientId || !this.clientSecret) {
      this._autoLoadClientSecretJson();
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google Client ID or Secret missing');
    }

    const redirect = customRedirectUri || this.redirectUri;
    const params = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirect,
      grant_type: 'authorization_code'
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.error || 'Failed to exchange authorization code for tokens');
    }

    // Attempt to fetch user email
    let userEmail = null;
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${data.access_token}` }
      });
      if (userRes.ok) {
        const userInfo = await userRes.json();
        userEmail = userInfo.email;
      }
    } catch (e) {
      // optional
    }

    const tokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || (this.tokens ? this.tokens.refreshToken : null),
      expiresIn: data.expires_in,
      expiresAt: Date.now() + (data.expires_in * 1000),
      tokenType: data.token_type,
      scope: data.scope,
      userEmail: userEmail || (this.tokens ? this.tokens.userEmail : null)
    };

    this._saveTokens(tokenData);
    return tokenData;
  }

  async getValidAccessToken() {
    if (!this.tokens || !this.tokens.accessToken) {
      throw new Error('Google Calendar is not connected. Please authenticate first.');
    }

    // If token has not expired (with 60s buffer), return it
    if (this.tokens.expiresAt && Date.now() < this.tokens.expiresAt - 60000) {
      return this.tokens.accessToken;
    }

    if (!this.tokens.refreshToken) {
      return this.tokens.accessToken;
    }

    // Refresh the token
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.tokens.refreshToken,
      grant_type: 'refresh_token'
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || 'Failed to refresh Google access token');
    }

    this._saveTokens({
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      expiresAt: Date.now() + (data.expires_in * 1000)
    });

    return data.access_token;
  }

  isConnected() {
    return !!(this.tokens && (this.tokens.accessToken || this.tokens.refreshToken));
  }

  /**
   * Helper to normalize a Calendar ID or extract from Google Calendar sharing URL / base64 cid
   */
  normalizeCalendarId(rawId) {
    if (!rawId || typeof rawId !== 'string') {
      return '0523b8e99981585d170a757b8d8bd09d1b3055c1715f933b2ac4ca319951f88f@group.calendar.google.com';
    }

    const trimmed = rawId.trim();

    // Check if full URL containing cid query parameter
    if (trimmed.includes('cid=')) {
      try {
        const urlObj = new URL(trimmed);
        const cidParam = urlObj.searchParams.get('cid');
        if (cidParam) {
          // If base64 encoded
          if (cidParam.endsWith('=') || /^[A-Za-z0-9+/=]+$/.test(cidParam)) {
            const decoded = Buffer.from(cidParam, 'base64').toString('utf-8');
            if (decoded.includes('@')) return decoded.trim();
          }
          return cidParam.trim();
        }
      } catch (e) {
        // Fallback regex match
        const match = trimmed.match(/cid=([^&]+)/);
        if (match && match[1]) {
          try {
            const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
            if (decoded.includes('@')) return decoded.trim();
          } catch (err) {
            return match[1].trim();
          }
        }
      }
    }

    // Check if raw base64 string
    if ((trimmed.endsWith('=') || /^[A-Za-z0-9+/=]{40,}$/.test(trimmed)) && !trimmed.includes('@')) {
      try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
        if (decoded.includes('@')) return decoded.trim();
      } catch (e) {
        // use raw
      }
    }

    return trimmed;
  }

  getEffectiveCalendarId() {
    const raw =
      process.env.GOOGLE_SHARED_CALENDAR_ID ||
      process.env.GOOGLE_CALENDAR_ID ||
      (this.tokens ? this.tokens.selectedCalendarId : null) ||
      '0523b8e99981585d170a757b8d8bd09d1b3055c1715f933b2ac4ca319951f88f@group.calendar.google.com';

    return this.normalizeCalendarId(raw);
  }

  setSharedCalendarId(calendarId, calendarName = '') {
    if (!calendarId) return;
    const normalized = this.normalizeCalendarId(calendarId);
    this._saveTokens({
      selectedCalendarId: normalized,
      selectedCalendarName: calendarName || normalized
    });
  }

  getConnectionStatus() {
    const activeCalId = this.getEffectiveCalendarId();
    return {
      connected: this.isConnected(),
      provider: 'Google Calendar API v3',
      userEmail: this.tokens ? this.tokens.userEmail : null,
      clientId: this.clientId ? `${this.clientId.substring(0, 16)}...` : null,
      redirectUri: this.redirectUri,
      hasRefreshToken: !!(this.tokens && this.tokens.refreshToken),
      lastUpdated: this.tokens ? this.tokens.updatedAt : null,
      targetCalendarId: activeCalId,
      targetCalendarName: this.tokens?.selectedCalendarName || (activeCalId === 'primary' ? 'Primary Calendar' : 'TurboSpace Shared Meeting Room Calendar'),
      isSharedCalendar: activeCalId !== 'primary',
      sharedCalendarUrl: `https://calendar.google.com/calendar/u/0?cid=${Buffer.from(activeCalId).toString('base64')}`
    };
  }

  disconnect() {
    this.tokens = null;
    try {
      if (fs.existsSync(tokenFilePath)) {
        fs.unlinkSync(tokenFilePath);
      }
    } catch (err) {
      console.warn('Could not delete token file:', err.message);
    }
  }

  /**
   * List all accessible Google Calendars (including Primary and Shared / Secondary calendars)
   */
  async listCalendars() {
    if (!this.isConnected()) return [];

    const accessToken = await this.getValidAccessToken();
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to list accessible Google Calendars');
    }

    const activeCalId = this.getEffectiveCalendarId();

    return (data.items || []).map(cal => ({
      id: cal.id,
      summary: cal.summary || cal.id,
      description: cal.description || '',
      primary: !!cal.primary,
      accessRole: cal.accessRole,
      selected: cal.id === activeCalId,
      isShared: !cal.primary,
      backgroundColor: cal.backgroundColor,
      timeZone: cal.timeZone
    }));
  }

  /**
   * Create a new dedicated shared calendar for meeting rooms in Google Calendar
   */
  async createSharedCalendar(summary = 'TurboSpace Shared Meeting Rooms', description = 'Shared calendar for company meeting room bookings and reservations') {
    if (!this.isConnected()) {
      throw new Error('Google Calendar is not connected.');
    }

    const accessToken = await this.getValidAccessToken();
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary,
        description,
        timeZone: process.env.GOOGLE_CALENDAR_TIMEZONE || process.env.TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to create shared Google Calendar');
    }

    // Set as currently active shared calendar
    this.setSharedCalendarId(data.id, data.summary);

    return data;
  }

  /**
   * Helper to format time slot string into ISO 8601 start and end datetime
   */
  _parseSlotTimes(dateStr, startTime, endTime, startIso, endIso) {
    const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || process.env.TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

    // If explicit start and end datetime strings are already provided
    if (startIso && endIso) {
      return {
        start: { dateTime: String(startIso).includes('T') ? startIso : `${startIso}:00`, timeZone: timezone },
        end: { dateTime: String(endIso).includes('T') ? endIso : `${endIso}:00`, timeZone: timezone }
      };
    }

    const safeDate = dateStr || new Date().toISOString().split('T')[0];
    let startTimeStr = startTime || '';
    let endTimeStr = endTime || '';

    // If a combined string was passed into startTime (e.g. "09:00 - 10:00")
    if (startTimeStr.includes('-') && !endTimeStr) {
      const parts = startTimeStr.split('-').map(s => s ? s.trim() : '');
      startTimeStr = parts[0];
      endTimeStr = parts[1] || '';
    }

    const parseTime = (tStr, defaultHour = 9) => {
      if (!tStr) return { hours: defaultHour, minutes: 0 };

      // Check 12-hour format e.g. "09:00 AM" or "2:30 PM"
      const match12 = tStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (match12) {
        let hours = parseInt(match12[1], 10);
        const minutes = parseInt(match12[2], 10);
        const period = match12[3].toUpperCase();
        if (period === 'PM' && hours < 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return { hours, minutes };
      }

      // Check 24-hour format e.g. "14:00" or "09:30"
      const match24 = tStr.match(/(\d{1,2}):(\d{2})/);
      if (match24) {
        return { hours: parseInt(match24[1], 10), minutes: parseInt(match24[2], 10) };
      }

      return { hours: defaultHour, minutes: 0 };
    };

    const startT = parseTime(startTimeStr || '09:00', 9);
    const endT = parseTime(endTimeStr || '10:00', startT.hours + 1);

    const startDateTime = `${safeDate}T${String(startT.hours).padStart(2, '0')}:${String(startT.minutes).padStart(2, '0')}:00`;
    const endDateTime = `${safeDate}T${String(endT.hours).padStart(2, '0')}:${String(endT.minutes).padStart(2, '0')}:00`;

    return {
      start: { dateTime: startDateTime, timeZone: timezone },
      end: { dateTime: endDateTime, timeZone: timezone }
    };
  }

  /**
   * Create an event in the shared Google Calendar for a booking using Room Name, Time, and Customer Details
   */
  async createCalendarEvent(booking, customCalendarId) {
    if (!this.isConnected()) {
      return null;
    }

    const accessToken = await this.getValidAccessToken();
    const timeRange = this._parseSlotTimes(booking.date, booking.startTime, booking.endTime, booking.start, booking.end);

    const targetCalendarId = customCalendarId || this.getEffectiveCalendarId();
    const roomName = booking.roomName || 'Meeting Room';
    const roomFloor = booking.roomFloor || '';
    const roomType = booking.roomType || 'Conference Space';
    const customerName = booking.customerName || 'Valued Client';
    const customerEmail = booking.customerEmail || '';
    const customerCompany = booking.customerCompany || 'Independent';
    const bookingTitle = booking.title || booking.purpose || `Meeting Room Reservation`;
    const bookingId = booking.id || `BK-${Date.now()}`;
    const attendeesCount = booking.attendees || 2;
    const notes = booking.notes || 'None';
    const totalCost = booking.totalCost !== undefined ? `$${booking.totalCost}` : 'N/A';
    const timeDisplay = (booking.startTime && booking.endTime) ? `${booking.startTime} - ${booking.endTime}` : (booking.slotLabel || 'Scheduled Time');

    // Build rich formatted event description
    const descriptionLines = [
      `========================================`,
      `🏢 TURBOSPACE MEETING ROOM RESERVATION`,
      `========================================`,
      ``,
      `📍 ROOM DETAILS:`,
      `• Room Name: ${roomName}`,
      roomFloor ? `• Location / Floor: ${roomFloor}` : null,
      `• Room Type: ${roomType}`,
      booking.roomCapacity ? `• Capacity: ${booking.roomCapacity} Persons` : null,
      ``,
      `🕒 SCHEDULE & TIME:`,
      `• Date: ${booking.date || 'Today'}`,
      `• Time: ${timeDisplay}`,
      `• Timezone: ${timeRange.start.timeZone}`,
      ``,
      `👤 CUSTOMER DETAILS:`,
      `• Name: ${customerName}`,
      customerEmail ? `• Email: ${customerEmail}` : null,
      `• Company / Organization: ${customerCompany}`,
      ``,
      `📋 RESERVATION SUMMARY:`,
      `• Reference ID: ${bookingId}`,
      `• Purpose: ${bookingTitle}`,
      `• Expected Attendees: ${attendeesCount}`,
      `• Total Fee: ${totalCost}`,
      `• Special Requests / Notes: ${notes}`,
      `• Status: Confirmed`,
      ``,
      `----------------------------------------`,
      `Booked via TurboSpace Shared Meeting Management System.`
    ].filter(line => line !== null).join('\n');

    // Build attendees list
    const attendees = [];
    if (customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      attendees.push({
        email: customerEmail.trim(),
        displayName: customerName
      });
    }

    const eventPayload = {
      summary: `[Room Booking] ${roomName} - ${customerName} (${customerCompany})`,
      description: descriptionLines,
      location: roomFloor ? `${roomName}, ${roomFloor}` : roomName,
      start: timeRange.start,
      end: timeRange.end,
      attendees: attendees.length > 0 ? attendees : undefined,
      guestsCanSeeOtherGuests: true,
      guestsCanInviteOthers: true,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 15 },
          { method: 'email', minutes: 60 }
        ]
      },
      transparency: 'opaque'
    };

    const targetUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events?sendUpdates=all`;

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventPayload)
    });

    const eventData = await res.json();
    if (!res.ok) {
      throw new Error(eventData.error?.message || `Failed to create Google Calendar event in calendar "${targetCalendarId}"`);
    }

    return {
      ...eventData,
      calendarId: targetCalendarId
    };
  }

  /**
   * Delete or cancel an event from the shared Google Calendar
   */
  async deleteCalendarEvent(eventId, customCalendarId) {
    if (!this.isConnected() || !eventId) return false;

    try {
      const targetCalendarId = customCalendarId || this.getEffectiveCalendarId();
      const accessToken = await this.getValidAccessToken();
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      // 204 No Content or 200 OK means successfully deleted. 404/410 means already deleted or not found.
      if (res.status === 204 || res.status === 200 || res.status === 404 || res.status === 410) {
        console.log(`[GoogleCalendarService] Deleted event ${eventId} from calendar "${targetCalendarId}" (HTTP ${res.status})`);
        return true;
      }

      const errText = await res.text().catch(() => '');
      console.warn(`[GoogleCalendarService] Failed to delete event ${eventId} (HTTP ${res.status}): ${errText}`);
      return false;
    } catch (err) {
      console.warn('[GoogleCalendarService] Exception deleting Google Calendar event:', err.message);
      return false;
    }
  }

  /**
   * List upcoming events from the target Google Calendar
   */
  async listCalendarEvents(maxResults = 20, customCalendarId) {
    if (!this.isConnected()) return [];

    const targetCalendarId = customCalendarId || this.getEffectiveCalendarId();
    const accessToken = await this.getValidAccessToken();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events?maxResults=${maxResults}&orderBy=startTime&singleEvents=true&timeMin=${new Date().toISOString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to list events for calendar "${targetCalendarId}"`);
    }

    return data.items || [];
  }
}

export const googleCalendarService = new GoogleCalendarService();
