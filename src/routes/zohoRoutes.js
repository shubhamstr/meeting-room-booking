import { Router } from 'express';
import { zohoCrmService } from '../services/zohoCrmService.js';
import { bookingService } from '../services/bookingService.js';

const router = Router();

// Helper to determine if client wants JSON response
const wantsJson = (req) => {
  return req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
};

// 1. Initiate OAuth Flow (Redirects to Zoho Accounts or returns auth URL)
router.get('/connect', (req, res) => {
  try {
    const dcKey = req.query.dc || process.env.ZOHO_DATA_CENTER || 'INDataCenter';
    const host = req.get('host');
    const protocol = req.protocol;
    const defaultRedirectUri = `${protocol}://${host}/api/zoho/callback`;
    const redirectUri = process.env.ZOHO_REDIRECT_URI || defaultRedirectUri;

    if (!zohoCrmService.clientId) {
      const msg = 'ZOHO_API_CLIENT_ID is missing from .env. Please configure it to connect.';
      if (wantsJson(req)) {
        return res.status(400).json({ success: false, error: msg });
      }
      return res.redirect('/customers?error=' + encodeURIComponent(msg));
    }

    const authUrl = zohoCrmService.getAuthUrl(redirectUri, dcKey);

    if (wantsJson(req)) {
      return res.json({ success: true, authUrl, redirectUri, dataCenter: dcKey });
    }

    res.redirect(authUrl);
  } catch (err) {
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect('/customers?error=' + encodeURIComponent('Failed to initiate Zoho CRM connection: ' + err.message));
  }
});

// 2. OAuth Callback from Zoho
router.get('/callback', async (req, res) => {
  const { code, error, error_description, state, location, 'accounts-server': accountsServer } = req.query;

  if (error) {
    const msg = `Zoho Auth Error: ${error} - ${error_description || 'Access denied'}`;
    if (wantsJson(req)) {
      return res.status(400).json({ success: false, error: msg });
    }
    return res.redirect('/customers?error=' + encodeURIComponent(msg));
  }

  if (!code) {
    const msg = 'Authorization code was not returned by Zoho.';
    if (wantsJson(req)) {
      return res.status(400).json({ success: false, error: msg });
    }
    return res.redirect('/customers?error=' + encodeURIComponent(msg));
  }

  try {
    const host = req.get('host');
    const protocol = req.protocol;
    const defaultRedirectUri = `${protocol}://${host}/api/zoho/callback`;
    const redirectUri = process.env.ZOHO_REDIRECT_URI || defaultRedirectUri;

    const locationHint = accountsServer || location || '';
    const connection = await zohoCrmService.handleOAuthCallback(code, redirectUri, locationHint);
    
    const orgName = connection.organization ? connection.organization.companyName : 'Zoho CRM';

    if (wantsJson(req)) {
      return res.json({
        success: true,
        message: `Successfully connected to ${orgName}`,
        data: connection
      });
    }

    res.redirect('/customers?success=' + encodeURIComponent(`Successfully connected to ${orgName} via @zohocrm/nodejs-sdk-2.0!`));
  } catch (err) {
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect('/customers?error=' + encodeURIComponent('Zoho Connection Failed: ' + err.message));
  }
});

// 3. Connect via Manual Self-Client Token (Grant Token or Refresh Token)
router.post('/token-connect', async (req, res) => {
  try {
    const { token, tokenType, dcKey } = req.body;
    if (!token || !token.trim()) {
      const msg = 'Please provide a valid Zoho token.';
      if (wantsJson(req)) {
        return res.status(400).json({ success: false, error: msg });
      }
      return res.redirect('/customers?error=' + encodeURIComponent(msg));
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const redirectUri = process.env.ZOHO_REDIRECT_URI || `${protocol}://${host}/api/zoho/callback`;

    await zohoCrmService.connectWithManualToken({
      token,
      tokenType: tokenType || 'grant',
      dcKey: dcKey || 'INDataCenter',
      redirectUri
    });

    if (wantsJson(req)) {
      return res.json({ success: true, message: 'Zoho CRM connected successfully via Developer Token!' });
    }

    res.redirect('/customers?success=' + encodeURIComponent('Zoho CRM connected successfully via Developer Token!'));
  } catch (err) {
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect('/customers?error=' + encodeURIComponent('Token Connection Failed: ' + err.message));
  }
});

// 4. Sync Contacts & Leads from Zoho CRM into Customer Directory (POST & GET)
const handleZohoSync = async (req, res) => {
  try {
    if (!zohoCrmService.isConnected()) {
      const msg = 'Please connect to Zoho CRM before syncing contacts.';
      if (wantsJson(req)) {
        return res.status(400).json({ success: false, error: msg });
      }
      return res.redirect('/customers?error=' + encodeURIComponent(msg));
    }

    const result = await zohoCrmService.syncCrmContactsToBookingService(bookingService);

    if (wantsJson(req)) {
      return res.json({
        success: true,
        message: `Synced ${result.syncedCount} new contacts/leads from Zoho CRM!`,
        data: result
      });
    }

    res.redirect('/customers?success=' + encodeURIComponent(`Synced ${result.syncedCount} new contacts/leads from Zoho CRM! Total customers: ${result.totalCustomers}`));
  } catch (err) {
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect('/customers?error=' + encodeURIComponent('Sync Failed: ' + err.message));
  }
};

router.post('/sync', handleZohoSync);
router.get('/sync', handleZohoSync);

// 5. Disconnect Zoho CRM (POST & GET)
const handleZohoDisconnect = (req, res) => {
  try {
    zohoCrmService.disconnect();

    if (wantsJson(req)) {
      return res.json({ success: true, message: 'Zoho CRM has been disconnected.' });
    }

    res.redirect('/customers?success=' + encodeURIComponent('Zoho CRM has been disconnected.'));
  } catch (err) {
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect('/customers?error=' + encodeURIComponent(err.message));
  }
};

router.post('/disconnect', handleZohoDisconnect);
router.get('/disconnect', handleZohoDisconnect);

// 6. JSON API for Connection Status
router.get('/status', (req, res) => {
  const status = zohoCrmService.getConnectionStatus();
  res.json({
    success: true,
    data: status
  });
});

// 7. Get Contacts from Zoho CRM directly
router.get('/contacts', async (req, res) => {
  try {
    if (!zohoCrmService.isConnected()) {
      return res.status(400).json({ success: false, error: 'Zoho CRM is not connected' });
    }
    const contacts = await zohoCrmService.fetchContacts(1, 100);
    res.json({ success: true, count: contacts.length, data: contacts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
