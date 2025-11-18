import { v4 as uuidv4 } from 'uuid';

export class WebhookHandler {
  constructor(paypalClient, db, webhookSecret) {
    this.paypal = paypalClient;
    this.db = db;
    this.webhookSecret = webhookSecret;
  }

  async verifyAndProcessWebhook(request, webhookId) {
    const headers = Object.fromEntries(request.headers);
    const body = await request.text();

    // Verifikasi signature webhook
    const verification = await this.paypal.verifyWebhookSignature(
      webhookId,
      headers,
      JSON.parse(body)
    );

    if (verification.verification_status !== 'SUCCESS') {
      throw new Error('Webhook signature verification failed');
    }

    const eventData = JSON.parse(body);
    
    // Simpan event webhook
    await this.saveWebhookEvent(eventData);
    
    // Process event berdasarkan type
    await this.processWebhookEvent(eventData);

    return { status: 'processed', event_id: eventData.id };
  }

  async saveWebhookEvent(eventData) {
    const eventId = uuidv4();
    
    await this.db.prepare(`
      INSERT INTO webhook_events (
        event_id, event_type, resource_type, resource_id, 
        summary, event_data
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      eventId,
      eventData.event_type,
      eventData.resource_type,
      eventData.resource.resource_id || eventData.id,
      eventData.summary || '',
      JSON.stringify(eventData)
    ).run();

    return eventId;
  }

  async processWebhookEvent(eventData) {
    const { event_type, resource } = eventData;

    switch (event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await this.handlePaymentCaptureCompleted(resource);
        break;
      
      case 'PAYMENT.CAPTURE.DENIED':
        await this.handlePaymentCaptureDenied(resource);
        break;
      
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await this.handleSubscriptionActivated(resource);
        break;
      
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await this.handleSubscriptionCancelled(resource);
        break;
      
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        await this.handleSubscriptionPaymentFailed(resource);
        break;
      
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        await this.handleSubscriptionExpired(resource);
        break;
      
      default:
        console.log(`Unhandled event type: ${event_type}`);
    }
  }

  async handlePaymentCaptureCompleted(resource) {
    // Update order status dan buat transaksi
    const order = await this.db.prepare(`
      SELECT * FROM orders WHERE paypal_order_id = ?
    `).bind(resource.supplementary_data.related_ids.order_id).first();

    if (order) {
      await this.db.prepare(`
        UPDATE orders SET status = 'COMPLETED', updated_at = datetime('now')
        WHERE order_id = ?
      `).bind(order.order_id).run();

      const transactionId = uuidv4();
      await this.db.prepare(`
        INSERT INTO transactions (
          transaction_id, order_id, amount, currency, status, paypal_transaction_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        transactionId,
        order.order_id,
        parseFloat(resource.amount.value),
        resource.amount.currency_code,
        'COMPLETED',
        resource.id
      ).run();
    }
  }

  async handleSubscriptionActivated(resource) {
    // Update subscription status
    await this.db.prepare(`
      UPDATE subscriptions 
      SET status = 'ACTIVE', updated_at = datetime('now')
      WHERE paypal_subscription_id = ?
    `).bind(resource.id).run();
  }

  async handleSubscriptionCancelled(resource) {
    // Update subscription status
    await this.db.prepare(`
      UPDATE subscriptions 
      SET status = 'CANCELLED', updated_at = datetime('now')
      WHERE paypal_subscription_id = ?
    `).bind(resource.id).run();
  }

  async handleSubscriptionPaymentFailed(resource) {
    // Handle failed subscription payment
    console.log('Subscription payment failed:', resource);
    
    await this.db.prepare(`
      UPDATE subscriptions 
      SET status = 'PAYMENT_FAILED', updated_at = datetime('now')
      WHERE paypal_subscription_id = ?
    `).bind(resource.id).run();
  }

  async handleSubscriptionExpired(resource) {
    // Update expired subscription
    await this.db.prepare(`
      UPDATE subscriptions 
      SET status = 'EXPIRED', updated_at = datetime('now')
      WHERE paypal_subscription_id = ?
    `).bind(resource.id).run();
  }

  async handlePaymentCaptureDenied(resource) {
    // Update order status untuk payment yang denied
    const order = await this.db.prepare(`
      SELECT * FROM orders WHERE paypal_order_id = ?
    `).bind(resource.supplementary_data.related_ids.order_id).first();

    if (order) {
      await this.db.prepare(`
        UPDATE orders SET status = 'FAILED', updated_at = datetime('now')
        WHERE order_id = ?
      `).bind(order.order_id).run();
    }
  }
}