import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';


const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

// Zoho CRM Node.js SDK 2.0 imports
const { InitializeBuilder } = require('@zohocrm/nodejs-sdk-2.0/routes/initialize_builder');
const { OAuthBuilder } = require('@zohocrm/nodejs-sdk-2.0/models/authenticator/oauth_builder');
const { UserSignature } = require('@zohocrm/nodejs-sdk-2.0/routes/user_signature');
const { FileStore } = require('@zohocrm/nodejs-sdk-2.0/models/authenticator/store/file_store');
const { SDKConfigBuilder } = require('@zohocrm/nodejs-sdk-2.0/routes/sdk_config_builder');
const { LogBuilder } = require('@zohocrm/nodejs-sdk-2.0/routes/logger/log_builder');
const { Levels } = require('@zohocrm/nodejs-sdk-2.0/routes/logger/logger');

// Data Centers
const { INDataCenter } = require('@zohocrm/nodejs-sdk-2.0/routes/dc/in_data_center');
const { USDataCenter } = require('@zohocrm/nodejs-sdk-2.0/routes/dc/us_data_center');
const { EUDataCenter } = require('@zohocrm/nodejs-sdk-2.0/routes/dc/eu_data_center');
const { AUDataCenter } = require('@zohocrm/nodejs-sdk-2.0/routes/dc/au_data_center');
const { CNDataCenter } = require('@zohocrm/nodejs-sdk-2.0/routes/dc/cn_data_center');
const { JPDataCenter } = require('@zohocrm/nodejs-sdk-2.0/routes/dc/jp_data_center');

// Record Operations from SDK
const { RecordOperations } = require('@zohocrm/nodejs-sdk-2.0/core/com/zoho/crm/api/record/record_operations');
const { ResponseWrapper } = require('@zohocrm/nodejs-sdk-2.0/core/com/zoho/crm/api/record/response_wrapper');
const { ParameterMap } = require('@zohocrm/nodejs-sdk-2.0/routes/parameter_map');
const { HeaderMap } = require('@zohocrm/nodejs-sdk-2.0/routes/header_map');

class ZohoCrmService {
  constructor() {
    // Directory for token and log storage
    this.storageDir = path.join(rootDir, 'storage');
    this.tokenFilePath = path.join(this.storageDir, 'zoho_sdk_tokens.txt');
    this.stateFilePath = path.join(this.storageDir, 'zoho_connection.json');
    this.logFilePath = path.join(this.storageDir, 'zoho_sdk.log');
    
    this.ensureStorageDir();

    this.sdkInitialized = false;
    this.currentConnection = this.loadPersistedState();
    
    // Try auto-initializing on startup if previous connection exists
    if (this.currentConnection && this.currentConnection.refreshToken) {
      this.initSDKWithRefreshToken(this.currentConnection.refreshToken, this.currentConnection.dcKey || this.defaultDcKey)
        .catch(err => console.warn('[Zoho CRM] Background init warning:', err.message));
    }
  }

  get clientId() {
    return (process.env.ZOHO_API_CLIENT_ID || '').trim();
  }

  get clientSecret() {
    return (process.env.ZOHO_API_CLIENT_SECRET || '').trim();
  }

  get defaultUserEmail() {
    return (process.env.ZOHO_CURRENT_USER_EMAIL || 'admin@turbospace.internal').trim();
  }

  get defaultDcKey() {
    return (process.env.ZOHO_DATA_CENTER || 'INDataCenter').trim();
  }


  ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    if (!fs.existsSync(this.tokenFilePath)) {
      fs.writeFileSync(this.tokenFilePath, '', 'utf-8');
    }
  }

  getDcInstance(dcKey = 'INDataCenter') {
    const key = (dcKey || 'INDataCenter').toLowerCase();
    if (key.includes('in') || key === 'in' || key === 'indatacenter') {
      return { dc: INDataCenter.PRODUCTION(), authUrl: 'https://accounts.zoho.in', apiUrl: 'https://www.zohoapis.in', name: 'India (zoho.in)' };
    }
    if (key.includes('eu') || key === 'eu' || key === 'eudatacenter') {
      return { dc: EUDataCenter.PRODUCTION(), authUrl: 'https://accounts.zoho.eu', apiUrl: 'https://www.zohoapis.eu', name: 'Europe (zoho.eu)' };
    }
    if (key.includes('au') || key === 'au' || key === 'audatacenter') {
      return { dc: AUDataCenter.PRODUCTION(), authUrl: 'https://accounts.zoho.com.au', apiUrl: 'https://www.zohoapis.com.au', name: 'Australia (zoho.com.au)' };
    }
    if (key.includes('cn') || key === 'cn' || key === 'cndatacenter') {
      return { dc: CNDataCenter.PRODUCTION(), authUrl: 'https://accounts.zoho.com.cn', apiUrl: 'https://www.zohoapis.com.cn', name: 'China (zoho.com.cn)' };
    }
    if (key.includes('jp') || key === 'jp' || key === 'jpdatacenter') {
      return { dc: JPDataCenter.PRODUCTION(), authUrl: 'https://accounts.zoho.jp', apiUrl: 'https://www.zohoapis.jp', name: 'Japan (zoho.jp)' };
    }
    return { dc: USDataCenter.PRODUCTION(), authUrl: 'https://accounts.zoho.com', apiUrl: 'https://www.zohoapis.com', name: 'United States (zoho.com)' };
  }

  getAuthUrl(redirectUri, dcKey = 'INDataCenter', state = 'turbosoft_oauth') {
    const dcInfo = this.getDcInstance(dcKey);
    const scopes = [
      'ZohoCRM.modules.ALL',
      'ZohoCRM.settings.ALL',
      'ZohoCRM.users.READ',
      'ZohoCRM.org.READ'
    ].join(',');

    const params = new URLSearchParams({
      scope: scopes,
      client_id: this.clientId,
      response_type: 'code',
      access_type: 'offline',
      redirect_uri: redirectUri,
      prompt: 'consent',
      state: `${state}:${dcKey}`
    });

    return `${dcInfo.authUrl}/oauth/v2/auth?${params.toString()}`;
  }

  async handleOAuthCallback(code, redirectUri, locationHint = '') {
    // Determine DC from location/server hint or default
    let dcKey = this.defaultDcKey;
    if (locationHint) {
      if (locationHint.includes('.in') || locationHint === 'in') dcKey = 'INDataCenter';
      else if (locationHint.includes('.eu') || locationHint === 'eu') dcKey = 'EUDataCenter';
      else if (locationHint.includes('.com.au') || locationHint === 'au') dcKey = 'AUDataCenter';
      else if (locationHint.includes('.jp') || locationHint === 'jp') dcKey = 'JPDataCenter';
      else if (locationHint.includes('.com.cn') || locationHint === 'cn') dcKey = 'CNDataCenter';
      else if (locationHint.includes('.com') || locationHint === 'us') dcKey = 'USDataCenter';
    }

    const dcInfo = this.getDcInstance(dcKey);

    // Exchange authorization code for tokens directly to obtain fresh refresh_token & access_token
    const tokenEndpoint = `${dcInfo.authUrl}/oauth/v2/token`;
    const bodyParams = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Zoho OAuth Error: ${data.error} - ${data.error_description || 'Check client ID and redirect URI'}`);
    }

    const refreshToken = data.refresh_token || (this.currentConnection && this.currentConnection.refreshToken);
    const accessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;
    const apiDomain = data.api_domain || dcInfo.apiUrl;

    // Persist Connection State
    const connectionState = {
      connected: true,
      dcKey,
      dcName: dcInfo.name,
      apiDomain,
      authUrl: dcInfo.authUrl,
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
      connectedAt: new Date().toISOString(),
      userEmail: this.defaultUserEmail
    };

    this.savePersistedState(connectionState);

    // Initialize Zoho CRM Node SDK with the refresh token / grant token
    await this.initSDKWithRefreshToken(refreshToken, dcKey, redirectUri);

    // Fetch Organization Info to enrich connection state
    try {
      const org = await this.getOrganizationDetails();
      if (org) {
        connectionState.organization = org;
        this.savePersistedState(connectionState);
      }
    } catch (e) {
      console.warn('[Zoho CRM] Note: Could not fetch org info yet:', e.message);
    }

    return connectionState;
  }

  async connectWithManualToken({ token, tokenType = 'grant', dcKey = 'INDataCenter', redirectUri = 'http://localhost:5000/zoho/callback' }) {
    const dcInfo = this.getDcInstance(dcKey);

    if (tokenType === 'grant') {
      // Exchange grant token
      const tokenEndpoint = `${dcInfo.authUrl}/oauth/v2/token`;
      const bodyParams = new URLSearchParams({
        code: token.trim(),
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });

      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString()
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(`Zoho Token Exchange Error: ${data.error} - ${data.error_description || 'Invalid Grant Token'}`);
      }

      const connectionState = {
        connected: true,
        dcKey,
        dcName: dcInfo.name,
        apiDomain: data.api_domain || dcInfo.apiUrl,
        authUrl: dcInfo.authUrl,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        connectedAt: new Date().toISOString(),
        userEmail: this.defaultUserEmail
      };

      this.savePersistedState(connectionState);
      await this.initSDKWithRefreshToken(data.refresh_token, dcKey, redirectUri);
      return connectionState;
    } else {
      // Refresh Token provided directly
      await this.initSDKWithRefreshToken(token.trim(), dcKey, redirectUri);
      const connectionState = {
        connected: true,
        dcKey,
        dcName: dcInfo.name,
        apiDomain: dcInfo.apiUrl,
        authUrl: dcInfo.authUrl,
        refreshToken: token.trim(),
        connectedAt: new Date().toISOString(),
        userEmail: this.defaultUserEmail
      };
      this.savePersistedState(connectionState);
      return connectionState;
    }
  }

  async initSDKWithRefreshToken(refreshToken, dcKey = 'INDataCenter', redirectUri = 'http://localhost:5000/zoho/callback') {
    try {
      this.ensureStorageDir();
      const dcInfo = this.getDcInstance(dcKey);
      const user = new UserSignature(this.defaultUserEmail);
      const environment = dcInfo.dc;

      const token = new OAuthBuilder()
        .clientId(this.clientId)
        .clientSecret(this.clientSecret)
        .refreshToken(refreshToken)
        .redirectURL(redirectUri)
        .build();

      const tokenstore = new FileStore(this.tokenFilePath);

      const logger = new LogBuilder()
        .level(Levels.INFO)
        .filePath(this.logFilePath)
        .build();

      const sdkConfig = new SDKConfigBuilder()
        .pickListValidation(false)
        .autoRefreshFields(false)
        .build();

      await (await new InitializeBuilder())
        .user(user)
        .environment(environment)
        .token(token)
        .store(tokenstore)
        .SDKConfig(sdkConfig)
        .resourcePath(this.storageDir)
        .logger(logger)
        .initialize();

      this.sdkInitialized = true;
      console.log(`[Zoho CRM] SDK successfully initialized with Data Center: ${dcInfo.name}`);
    } catch (err) {
      console.error('[Zoho CRM] SDK Initialization failed:', err);
      throw err;
    }
  }

  async getValidAccessToken() {
    if (!this.currentConnection || !this.currentConnection.refreshToken) {
      throw new Error('Zoho CRM is not connected. Please connect via OAuth.');
    }

    // Check if token is still valid (with 2 min buffer)
    if (this.currentConnection.accessToken && this.currentConnection.expiresAt && Date.now() < this.currentConnection.expiresAt - 120000) {
      return this.currentConnection.accessToken;
    }

    // Refresh token
    const dcInfo = this.getDcInstance(this.currentConnection.dcKey || this.defaultDcKey);
    const tokenEndpoint = `${dcInfo.authUrl}/oauth/v2/token`;
    const params = new URLSearchParams({
      refresh_token: this.currentConnection.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token'
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`Token Refresh Failed: ${data.error}`);
    }

    this.currentConnection.accessToken = data.access_token;
    this.currentConnection.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    this.savePersistedState(this.currentConnection);

    return data.access_token;
  }

  async getOrganizationDetails() {
    try {
      const accessToken = await this.getValidAccessToken();
      const apiDomain = (this.currentConnection && this.currentConnection.apiDomain) || this.getDcInstance(this.currentConnection?.dcKey).apiUrl;
      
      const res = await fetch(`${apiDomain}/crm/v2/org`, {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`
        }
      });

      if (!res.ok) return null;
      const data = await res.json();
      if (data.org && data.org.length > 0) {
        const org = data.org[0];
        return {
          id: org.id,
          companyName: org.company_name,
          alias: org.alias,
          primaryEmail: org.primary_email,
          country: org.country,
          currency: org.currency_symbol || org.currency_locale
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async fetchRecords(moduleAPIName = 'Contacts') {
    if (!this.isConnected()) {
      throw new Error('Zoho CRM is not connected.');
    }

    // Attempt using SDK RecordOperations first
    try {
      if (this.sdkInitialized) {
        const recordOperations = new RecordOperations();
        const paramInstance = new ParameterMap();
        const headerInstance = new HeaderMap();

        const response = await recordOperations.getRecords(moduleAPIName, paramInstance, headerInstance);
        if (response != null && response.statusCode === 200 && response.object instanceof ResponseWrapper) {
          const records = response.object.getData() || [];
          return records.map(r => {
            const map = r.getKeyValues() || new Map();
            const recordObj = { id: r.getId() };
            for (const [k, v] of map.entries()) {
              recordObj[k] = v;
            }
            return recordObj;
          });
        }
      }
    } catch (sdkErr) {
      console.warn(`[Zoho CRM SDK] Fallback to REST API for ${moduleAPIName}:`, sdkErr.message);
    }

    // Direct REST API Fallback
    const accessToken = await this.getValidAccessToken();
    const apiDomain = (this.currentConnection && this.currentConnection.apiDomain) || this.getDcInstance(this.currentConnection?.dcKey).apiUrl;
    const res = await fetch(`${apiDomain}/crm/v2/${moduleAPIName}?per_page=50`, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `Failed to fetch ${moduleAPIName} from Zoho CRM`);
    }

    return data.data || [];
  }

  async syncCrmContactsToBookingService(bookingService) {
    if (!this.isConnected()) {
      throw new Error('Zoho CRM is not connected.');
    }

    let queueEntry = null;
    try {
      queueEntry = await bookingService.addToQueue('ZOHO_SYNC', { initiatedAt: new Date().toISOString() });
    } catch (e) {
      console.warn('[Zoho CRM] Note: Could not create queue entry:', e.message);
    }

    let syncedCount = 0;
    const importedCustomers = [];

    // 1. Fetch Contacts from Zoho CRM
    try {
      const contacts = await this.fetchRecords('Contacts');
      for (const contact of contacts) {
        const rawName = contact.Full_Name || `${contact.First_Name || ''} ${contact.Last_Name || ''}`.trim() || 'Zoho Contact';
        const fullName = typeof rawName === 'object' ? (rawName.name || 'Zoho Contact') : String(rawName);
        const email = (typeof contact.Email === 'string' && contact.Email) ? contact.Email.toLowerCase() : `${contact.id || Date.now()}@zoho-contact.com`;
        const company = (contact.Account_Name && contact.Account_Name.name) || (typeof contact.Department === 'string' ? contact.Department : 'Zoho CRM Client');
        const phone = (typeof contact.Phone === 'string' ? contact.Phone : '') || (typeof contact.Mobile === 'string' ? contact.Mobile : '') || '+1 (555) 019-2831';
        const department = typeof contact.Department === 'string' ? contact.Department : 'Corporate';
        const zohoId = String(contact.id || '');

        const cust = await bookingService.addCustomer({
          id: zohoId ? `zoho-${zohoId}` : undefined,
          zohoId: zohoId || null,
          name: fullName,
          email,
          company,
          department,
          phone,
          source: 'Zoho CRM Contact'
        });

        syncedCount++;
        importedCustomers.push(cust);
      }
    } catch (err) {
      console.warn('[Zoho Sync] Contacts fetch note:', err.message);
    }

    // 2. Fetch Leads from Zoho CRM
    try {
      const leads = await this.fetchRecords('Leads');
      for (const lead of leads) {
        const rawName = lead.Full_Name || `${lead.First_Name || ''} ${lead.Last_Name || ''}`.trim() || 'Zoho Lead';
        const fullName = typeof rawName === 'object' ? (rawName.name || 'Zoho Lead') : String(rawName);
        const email = (typeof lead.Email === 'string' && lead.Email) ? lead.Email.toLowerCase() : `${lead.id || Date.now()}@zoho-lead.com`;
        const company = typeof lead.Company === 'object' ? (lead.Company.name || 'Zoho Enterprise') : (lead.Company || 'Zoho Enterprise');
        const phone = (typeof lead.Phone === 'string' ? lead.Phone : '') || (typeof lead.Mobile === 'string' ? lead.Mobile : '') || '+1 (555) 018-9273';
        const department = typeof lead.Industry === 'object' ? (lead.Industry.name || lead.Industry.value || 'Prospect') : (lead.Industry || 'Prospect');
        const zohoId = String(lead.id || '');

        const cust = await bookingService.addCustomer({
          id: zohoId ? `zoho-lead-${zohoId}` : undefined,
          zohoId: zohoId || null,
          name: fullName,
          email,
          company,
          department,
          phone,
          source: 'Zoho CRM Lead'
        });

        syncedCount++;
        importedCustomers.push(cust);
      }
    } catch (err) {
      console.warn('[Zoho Sync] Leads fetch note:', err.message);
    }

    if (this.currentConnection) {
      this.currentConnection.lastSyncedAt = new Date().toISOString();
      this.currentConnection.lastSyncCount = syncedCount;
      this.savePersistedState(this.currentConnection);
    }

    // Mark Queue task completed
    if (queueEntry && queueEntry.id) {
      try {
        await bookingService.updateQueueStatus(queueEntry.id, 'COMPLETED');
      } catch (e) {
        console.warn('[Zoho CRM] Could not update queue status:', e.message);
      }
    }

    const currentCustomers = await bookingService.getCustomers();

    return {
      syncedCount,
      totalCustomers: currentCustomers.length,
      importedCustomers
    };
  }

  isConnected() {
    return Boolean(this.currentConnection && this.currentConnection.connected && this.currentConnection.refreshToken);
  }

  getConnectionStatus() {
    const isConn = this.isConnected();
    return {
      connected: isConn,
      clientId: this.clientId ? `${this.clientId.substring(0, 8)}...` : 'Not Configured',
      isConfigured: Boolean(this.clientId && this.clientSecret),
      dataCenter: (this.currentConnection && this.currentConnection.dcName) || this.getDcInstance(this.defaultDcKey).name,
      dcKey: (this.currentConnection && this.currentConnection.dcKey) || this.defaultDcKey,
      userEmail: (this.currentConnection && this.currentConnection.userEmail) || this.defaultUserEmail,
      organization: this.currentConnection?.organization || null,
      connectedAt: this.currentConnection?.connectedAt || null,
      lastSyncedAt: this.currentConnection?.lastSyncedAt || null,
      lastSyncCount: this.currentConnection?.lastSyncCount || 0
    };
  }

  disconnect() {
    this.currentConnection = null;
    this.sdkInitialized = false;
    try {
      if (fs.existsSync(this.stateFilePath)) {
        fs.unlinkSync(this.stateFilePath);
      }
      if (fs.existsSync(this.tokenFilePath)) {
        fs.writeFileSync(this.tokenFilePath, '', 'utf-8');
      }
    } catch (e) {
      console.warn('[Zoho CRM] Disconnect cleanup note:', e.message);
    }
  }

  loadPersistedState() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[Zoho CRM] Failed to load persisted state:', e.message);
    }
    return null;
  }

  savePersistedState(state) {
    this.currentConnection = state;
    try {
      this.ensureStorageDir();
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Zoho CRM] Failed to save state:', e.message);
    }
  }
}

export const zohoCrmService = new ZohoCrmService();
