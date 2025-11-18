export class PayPalClient {
  constructor(env) {
    this.clientId = env.PAYPAL_CLIENT_ID;
    this.clientSecret = env.PAYPAL_CLIENT_SECRET;
    this.baseUrl = env.PAYPAL_BASE_URL;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const auth = btoa(`${this.clientId}:${this.clientSecret}`);
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error('Failed to get PayPal access token');
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 minute buffer
    
    return this.accessToken;
  }

  async makeRequest(endpoint, options = {}) {
    const token = await this.getAccessToken();
    
    const defaultHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PayPal API error: ${error}`);
    }

    return response.json();
  }

  // Order Methods
  async createOrder(orderData) {
    return this.makeRequest('/v2/checkout/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  }

  async captureOrder(orderId) {
    return this.makeRequest(`/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
    });
  }

  async getOrder(orderId) {
    return this.makeRequest(`/v2/checkout/orders/${orderId}`);
  }

  // Subscription Methods
  async createSubscription(subscriptionData) {
    return this.makeRequest('/v1/billing/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subscriptionData),
    });
  }

  async getSubscription(subscriptionId) {
    return this.makeRequest(`/v1/billing/subscriptions/${subscriptionId}`);
  }

  async cancelSubscription(subscriptionId, reason = '') {
    return this.makeRequest(`/v1/billing/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // Webhook Verification
  async verifyWebhookSignature(webhookId, headers, body) {
    const verificationData = {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: body,
    };

    return this.makeRequest('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: JSON.stringify(verificationData),
    });
  }
}