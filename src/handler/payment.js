import { v4 as uuidv4 } from 'uuid';

export class PaymentHandler {
  constructor(paypalClient, db) {
    this.paypal = paypalClient;
    this.db = db;
  }

  async createOrder(customerData, orderData) {
    const { customer_id, email, name } = customerData;
    const { amount, currency, items, return_url, cancel_url } = orderData;

    // Simpan customer data
    await this.db.prepare(`
      INSERT OR IGNORE INTO customers (customer_id, email, name)
      VALUES (?, ?, ?)
    `).bind(customer_id, email, name).run();

    // Buat order di PayPal
    const paypalOrder = await this.paypal.createOrder({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency || 'USD',
          value: amount.toString(),
        },
        items: items?.map(item => ({
          name: item.name,
          quantity: item.quantity.toString(),
          unit_amount: {
            currency_code: currency || 'USD',
            value: item.price.toString(),
          },
        })),
      }],
      application_context: {
        brand_name: 'Your Brand Name',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        return_url: return_url,
        cancel_url: cancel_url,
      },
    });

    // Simpan order ke database
    const orderId = uuidv4();
    await this.db.prepare(`
      INSERT INTO orders (order_id, customer_id, paypal_order_id, status, amount, currency, items)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId,
      customer_id,
      paypalOrder.id,
      'CREATED',
      amount,
      currency || 'USD',
      JSON.stringify(items || [])
    ).run();

    return {
      order_id: orderId,
      paypal_order_id: paypalOrder.id,
      status: paypalOrder.status,
      links: paypalOrder.links,
    };
  }

  async captureOrder(orderId) {
    // Dapatkan data order dari database
    const order = await this.db.prepare(`
      SELECT * FROM orders WHERE order_id = ?
    `).bind(orderId).first();

    if (!order) {
      throw new Error('Order not found');
    }

    // Capture order di PayPal
    const captureResult = await this.paypal.captureOrder(order.paypal_order_id);

    // Update status order
    await this.db.prepare(`
      UPDATE orders SET status = ?, updated_at = datetime('now')
      WHERE order_id = ?
    `).bind(captureResult.status, orderId).run();

    // Simpan transaksi
    const transactionId = uuidv4();
    await this.db.prepare(`
      INSERT INTO transactions (transaction_id, order_id, amount, currency, status, paypal_transaction_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      transactionId,
      orderId,
      order.amount,
      order.currency,
      'COMPLETED',
      captureResult.id
    ).run();

    return {
      order_id: orderId,
      status: captureResult.status,
      transaction_id: transactionId,
      paypal_capture_id: captureResult.id,
    };
  }

  async getOrderStatus(orderId) {
    const order = await this.db.prepare(`
      SELECT o.*, c.email, c.name 
      FROM orders o 
      JOIN customers c ON o.customer_id = c.customer_id 
      WHERE o.order_id = ?
    `).bind(orderId).first();

    if (!order) {
      throw new Error('Order not found');
    }

    return order;
  }
}