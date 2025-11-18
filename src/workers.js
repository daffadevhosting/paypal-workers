import { Hono } from 'hono';
import { PayPalClient } from './utils/paypal.js';
import { PaymentHandler } from './handlers/payment.js';
import { SubscriptionHandler } from './handlers/subscription.js';
import { WebhookHandler } from './handlers/webhook.js';

const app = new Hono();

// Middleware untuk logging
app.use('*', async (c, next) => {
  console.log(`${c.req.method} ${c.req.url}`);
  await next();
});

// Middleware untuk CORS
app.use('/api/*', async (c, next) => {
  await next();
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
});

// Health check
app.get('/', (c) => c.text('PayPal Payment Worker is running!'));

// Routes untuk payments
app.post('/api/payments/create-order', async (c) => {
  try {
    const { customer, order } = await c.req.json();
    
    const paypalClient = new PayPalClient(c.env);
    const paymentHandler = new PaymentHandler(paypalClient, c.env.DB);
    
    const result = await paymentHandler.createOrder(customer, order);
    
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating order:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post('/api/payments/capture-order/:orderId', async (c) => {
  try {
    const orderId = c.req.param('orderId');
    
    const paypalClient = new PayPalClient(c.env);
    const paymentHandler = new PaymentHandler(paypalClient, c.env.DB);
    
    const result = await paymentHandler.captureOrder(orderId);
    
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error('Error capturing order:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.get('/api/payments/order/:orderId', async (c) => {
  try {
    const orderId = c.req.param('orderId');
    
    const paypalClient = new PayPalClient(c.env);
    const paymentHandler = new PaymentHandler(paypalClient, c.env.DB);
    
    const result = await paymentHandler.getOrderStatus(orderId);
    
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting order:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Routes untuk subscriptions
app.post('/api/subscriptions/create', async (c) => {
  try {
    const { customer, subscription } = await c.req.json();
    
    const paypalClient = new PayPalClient(c.env);
    const subscriptionHandler = new SubscriptionHandler(paypalClient, c.env.DB);
    
    const result = await subscriptionHandler.createSubscription(customer, subscription);
    
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.get('/api/subscriptions/:subscriptionId', async (c) => {
  try {
    const subscriptionId = c.req.param('subscriptionId');
    
    const paypalClient = new PayPalClient(c.env);
    const subscriptionHandler = new SubscriptionHandler(paypalClient, c.env.DB);
    
    const result = await subscriptionHandler.getSubscription(subscriptionId);
    
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting subscription:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post('/api/subscriptions/:subscriptionId/cancel', async (c) => {
  try {
    const subscriptionId = c.req.param('subscriptionId');
    const { reason } = await c.req.json();
    
    const paypalClient = new PayPalClient(c.env);
    const subscriptionHandler = new SubscriptionHandler(paypalClient, c.env.DB);
    
    const result = await subscriptionHandler.cancelSubscription(subscriptionId, reason);
    
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Webhook endpoint
app.post('/api/webhook/paypal', async (c) => {
  try {
    const paypalClient = new PayPalClient(c.env);
    const webhookHandler = new WebhookHandler(
      paypalClient, 
      c.env.DB, 
      c.env.WEBHOOK_SECRET
    );
    
    // Anda perlu mendapatkan webhook ID dari environment variables
    const webhookId = c.env.PAYPAL_WEBHOOK_ID;
    
    const result = await webhookHandler.verifyAndProcessWebhook(c.req, webhookId);
    
    return c.json({ success: true, data: result });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return c.json({ success: false, error: error.message }, 400);
  }
});

// Route untuk mendapatkan webhook events (untuk debugging)
app.get('/api/webhook/events', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 50
    `).all();
    
    return c.json({ success: true, data: results });
  } catch (error) {
    console.error('Error getting webhook events:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default app;