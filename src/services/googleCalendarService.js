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

  getConnectionStatus() {
    return {
      connected: this.isConnected(),
      provider: 'Google Calendar API v3',
      userEmail: this.tokens ? this.tokens.userEmail : null,
      clientId: this.clientId ? `${this.clientId.substring(0, 16)}...` : null,
      redirectUri: this.redirectUri,
      hasRefreshToken: !!(this.tokens && this.tokens.refreshToken),
      lastUpdated: this.tokens ? this.tokens.updatedAt : null
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
   * Helper to format time slot string into ISO 8601 start and end datetime
   */
  _parseSlotTimes(dateStr, slotLabel) {
    // Example slotLabel: "09:00 AM - 10:00 AM" or "02:00 PM - 03:00 PM"
    const [startTimeStr, endTimeStr] = slotLabel.split('-').map(s => s.trim());
    
    const parseTime = (tStr) => {
      const match = tStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return { hours: 9, minutes: 0 };
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const period = match[3].toUpperCase();
      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return { hours, minutes };
    };

    const startT = parseTime(startTimeStr);
    const endT = parseTime(endTimeStr);

    const startDateTime = new Date(`${dateStr}T${String(startT.hours).padStart(2, '0')}:${String(startT.minutes).padStart(2, '0')}:00`);
    const endDateTime = new Date(`${dateStr}T${String(endT.hours).padStart(2, '0')}:${String(endT.minutes).padStart(2, '0')}:00`);

    return {
      start: { dateTime: startDateTime.toISOString(), timeZone: 'Asia/Kolkata' },
      end: { dateTime: endDateTime.toISOString(), timeZone: 'Asia/Kolkata' }
    };
  }

  /**
   * Create an event in primary Google Calendar for a booking
   */
  async createCalendarEvent(booking) {
    if (!this.isConnected()) {
      return null;
    }

    const accessToken = await this.getValidAccessToken();
    const timeRange = this._parseSlotTimes(booking.date, booking.slotLabel);

    const eventPayload = {
      summary: `[Room Booking] ${booking.title || 'Meeting'} - ${booking.roomName}`,
      description: `Meeting Room Reservation\n\nBooking ID: ${booking.id}\nRoom: ${booking.roomName}\nCustomer: ${booking.customerName} (${booking.customerCompany})\nAttendees: ${booking.attendees}\nNotes: ${booking.notes || 'None'}`,
      location: booking.roomName,
      start: timeRange.start,
      end: timeRange.end,
      attendees: [
        { displayName: booking.customerName }
      ]
    };

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventPayload)
    });

    const eventData = await res.json();
    if (!res.ok) {
      throw new Error(eventData.error?.message || 'Failed to create Google Calendar event');
    }

    return eventData;
  }

  /**
   * Delete or cancel an event from Google Calendar
   */
  async deleteCalendarEvent(eventId) {
    if (!this.isConnected() || !eventId) return;

    try {
      const accessToken = await this.getValidAccessToken();
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } catch (err) {
      console.warn('Failed to delete Google Calendar event:', err.message);
    }
  }

  /**
   * List upcoming events from primary Google Calendar
   */
  async listCalendarEvents(maxResults = 20) {
    if (!this.isConnected()) return [];

    const accessToken = await this.getValidAccessToken();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&orderBy=startTime&singleEvents=true&timeMin=${new Date().toISOString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to list Google Calendar events');
    }

    return data.items || [];
  }
}

export const googleCalendarService = new GoogleCalendarService();
