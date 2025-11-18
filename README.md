# paypal-workers

```shell
-- Tabel untuk menyimpan data pembeli
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabel untuk orders
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE NOT NULL,
    customer_id TEXT NOT NULL,
    paypal_order_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    items TEXT, -- JSON string untuk items
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Tabel untuk subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id TEXT UNIQUE NOT NULL,
    customer_id TEXT NOT NULL,
    paypal_subscription_id TEXT UNIQUE NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    next_billing_time DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Tabel untuk webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    summary TEXT,
    event_data TEXT NOT NULL, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabel untuk payment transactions
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    order_id TEXT,
    subscription_id TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT NOT NULL,
    paypal_transaction_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id)
);
```
---
- Membuat Order
```js
const response = await fetch('https://your-worker.workers.dev/api/payments/create-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customer: {
      customer_id: 'cust_123',
      email: 'customer@example.com',
      name: 'John Doe'
    },
    order: {
      amount: '100.00',
      currency: 'USD',
      items: [
        { name: 'Product 1', quantity: 1, price: '100.00' }
      ],
      return_url: 'https://yoursite.com/success',
      cancel_url: 'https://yoursite.com/cancel'
    }
  })
});
```
- Membuat Subscriptions
```js
const response = await fetch('https://your-worker.workers.dev/api/subscriptions/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customer: {
      customer_id: 'cust_123',
      email: 'customer@example.com',
      name: 'John Doe'
    },
    subscription: {
      plan_id: 'P-123456789',
      return_url: 'https://yoursite.com/success',
      cancel_url: 'https://yoursite.com/cancel'
    }
  })
});
```
---
Fitur yang Diimplementasikan:

1. ✅ Payment Processing - Create, capture, dan get order status
2. ✅ Subscription Management - Create, get, dan cancel subscription
3. ✅ Webhook Handling - Verifikasi dan proses notifikasi PayPal
4. ✅ Database Storage - Penyimpanan data pembeli, orders, subscriptions, dan transaksi
5. ✅ Error Handling - Penanganan error yang komprehensif
6. ✅ Security - Verifikasi signature webhook dan validasi data
---