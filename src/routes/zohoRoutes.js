import { Router } from 'express';
import { zohoCrmService } from '../services/zohoCrmService.js';
import { bookingService } from '../services/bookingService.js';

const router = Router();

// 1. Initiate OAuth Flow (Redirects to Zoho Accounts)
router.get('/connect', (req, res) => {
  try {
    const dcKey = req.query.dc || process.env.ZOHO_DATA_CENTER || 'INDataCenter';
    const host = req.get('host');
    const protocol = req.protocol;
    const defaultRedirectUri = `${protocol}://${host}/zoho/callback`;
    const redirectUri = process.env.ZOHO_REDIRECT_URI || defaultRedirectUri;

    if (!zohoCrmService.clientId) {
      return res.redirect('/customers?error=' + encodeURIComponent('ZOHO_API_CLIENT_ID is missing from .env. Please configure it to connect.'));
    }

    const authUrl = zohoCrmService.getAuthUrl(redirectUri, dcKey);
    res.redirect(authUrl);
  } catch (err) {
    res.redirect('/customers?error=' + encodeURIComponent('Failed to initiate Zoho CRM connection: ' + err.message));
  }
});

// 2. OAuth Callback from Zoho
router.get('/callback', async (req, res) => {
  const { code, error, error_description, state, location, 'accounts-server': accountsServer } = req.query;

  if (error) {
    return res.redirect('/customers?error=' + encodeURIComponent(`Zoho Auth Error: ${error} - ${error_description || 'Access denied'}`));
  }

  if (!code) {
    return res.redirect('/customers?error=' + encodeURIComponent('Authorization code was not returned by Zoho.'));
  }

  try {
    const host = req.get('host');
    const protocol = req.protocol;
    const defaultRedirectUri = `${protocol}://${host}/zoho/callback`;
    const redirectUri = process.env.ZOHO_REDIRECT_URI || defaultRedirectUri;

    const locationHint = accountsServer || location || '';
    const connection = await zohoCrmService.handleOAuthCallback(code, redirectUri, locationHint);
    
    const orgName = connection.organization ? connection.organization.companyName : 'Zoho CRM';
    res.redirect('/customers?success=' + encodeURIComponent(`Successfully connected to ${orgName} via @zohocrm/nodejs-sdk-2.0!`));
  } catch (err) {
    res.redirect('/customers?error=' + encodeURIComponent('Zoho Connection Failed: ' + err.message));
  }
});

// 3. Connect via Manual Self-Client Token (Grant Token or Refresh Token)
router.post('/token-connect', async (req, res) => {
  try {
    const { token, tokenType, dcKey } = req.body;
    if (!token || !token.trim()) {
      return res.redirect('/customers?error=' + encodeURIComponent('Please provide a valid Zoho token.'));
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const redirectUri = process.env.ZOHO_REDIRECT_URI || `${protocol}://${host}/zoho/callback`;

    await zohoCrmService.connectWithManualToken({
      token,
      tokenType: tokenType || 'grant',
      dcKey: dcKey || 'INDataCenter',
      redirectUri
    });

    res.redirect('/customers?success=' + encodeURIComponent('Zoho CRM connected successfully via Developer Token!'));
  } catch (err) {
    res.redirect('/customers?error=' + encodeURIComponent('Token Connection Failed: ' + err.message));
  }
});

// 4. Sync Contacts & Leads from Zoho CRM into Customer Directory
router.post('/sync', async (req, res) => {
  try {
    if (!zohoCrmService.isConnected()) {
      return res.redirect('/customers?error=' + encodeURIComponent('Please connect to Zoho CRM before syncing contacts.'));
    }

    const result = await zohoCrmService.syncCrmContactsToBookingService(bookingService);
    res.redirect('/customers?success=' + encodeURIComponent(`Synced ${result.syncedCount} new contacts/leads from Zoho CRM! Total customers: ${result.totalCustomers}`));
  } catch (err) {
    res.redirect('/customers?error=' + encodeURIComponent('Sync Failed: ' + err.message));
  }
});

// 5. Disconnect Zoho CRM
router.post('/disconnect', (req, res) => {
  try {
    zohoCrmService.disconnect();
    res.redirect('/customers?success=' + encodeURIComponent('Zoho CRM has been disconnected.'));
  } catch (err) {
    res.redirect('/customers?error=' + encodeURIComponent(err.message));
  }
});

// 6. JSON API for Connection Status
router.get('/status', (req, res) => {
  const status = zohoCrmService.getConnectionStatus();
  res.json({
    success: true,
    data: status
  });
});

export default router;
