import { v4 as uuidv4 } from 'uuid';

export class SubscriptionHandler {
  constructor(paypalClient, db) {
    this.paypal = paypalClient;
    this.db = db;
  }

  async createSubscription(customerData, subscriptionData) {
    const { customer_id, email, name } = customerData;
    const { plan_id, return_url, cancel_url } = subscriptionData;

    // Simpan customer data
    await this.db.prepare(`
      INSERT OR IGNORE INTO customers (customer_id, email, name)
      VALUES (?, ?, ?)
    `).bind(customer_id, email, name).run();

    // Buat subscription di PayPal
    const paypalSubscription = await this.paypal.createSubscription({
      plan_id: plan_id,
      start_time: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // Start in 5 minutes
      application_context: {
        brand_name: 'Your Brand Name',
        locale: 'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        payment_method: {
          payer_selected: 'PAYPAL',
          payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED',
        },
        return_url: return_url,
        cancel_url: cancel_url,
      },
    });

    // Simpan subscription ke database
    const subscriptionId = uuidv4();
    await this.db.prepare(`
      INSERT INTO subscriptions (
        subscription_id, customer_id, paypal_subscription_id, 
        plan_id, status, start_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      subscriptionId,
      customer_id,
      paypalSubscription.id,
      plan_id,
      paypalSubscription.status,
      new Date().toISOString()
    ).run();

    return {
      subscription_id: subscriptionId,
      paypal_subscription_id: paypalSubscription.id,
      status: paypalSubscription.status,
      links: paypalSubscription.links,
    };
  }

  async getSubscription(subscriptionId) {
    const subscription = await this.db.prepare(`
      SELECT s.*, c.email, c.name 
      FROM subscriptions s 
      JOIN customers c ON s.customer_id = c.customer_id 
      WHERE s.subscription_id = ?
    `).bind(subscriptionId).first();

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Dapatkan data terbaru dari PayPal
    const paypalData = await this.paypal.getSubscription(subscription.paypal_subscription_id);

    // Update data di database jika diperlukan
    await this.db.prepare(`
      UPDATE subscriptions 
      SET status = ?, next_billing_time = ?, updated_at = datetime('now')
      WHERE subscription_id = ?
    `).bind(
      paypalData.status,
      paypalData.billing_info?.next_billing_time,
      subscriptionId
    ).run();

    return {
      ...subscription,
      paypal_data: paypalData,
    };
  }

  async cancelSubscription(subscriptionId, reason = '') {
    const subscription = await this.db.prepare(`
      SELECT * FROM subscriptions WHERE subscription_id = ?
    `).bind(subscriptionId).first();

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Cancel di PayPal
    await this.paypal.cancelSubscription(subscription.paypal_subscription_id, reason);

    // Update status di database
    await this.db.prepare(`
      UPDATE subscriptions 
      SET status = 'CANCELLED', updated_at = datetime('now')
      WHERE subscription_id = ?
    `).bind(subscriptionId).run();

    return {
      subscription_id: subscriptionId,
      status: 'CANCELLED',
      cancelled_at: new Date().toISOString(),
    };
  }
}