
import nodemailer from 'nodemailer';

export function createTransport(){
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = (process.env.SMTP_SECURE || 'false') === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass){
    console.warn('SMTP not fully configured. Emails will be logged to console.');
    return null;
  }
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

export async function sendOrderEmail(order){
  const to = process.env.ORDER_EMAIL_TO || 'sagarmathaonstore@gmail.com';
  const subject = `New Order #${order.id} – ${order.customer_name}`;
  const lines = [
    `Order ID: ${order.id}`,
    `Date: ${order.created_at}`,
    `Name: ${order.customer_name}`,
    `Email: ${order.email}`,
    `Phone: ${order.phone}`,
    `Address: ${order.address}, ${order.city}`,
    `Inside Valley: ${order.inside_valley ? 'Yes' : 'No'}`,
    `Delivery Fee: NPR ${order.delivery_fee}`,
    `Payment: ${order.payment_method} (${order.payment_status})`,
    ``,
    `Items:`
  ];
  const items = JSON.parse(order.items_json);
  items.forEach(i => lines.push(`- ${i.title} x ${i.qty} = NPR ${i.price * i.qty}`));
  lines.push('', `Subtotal: NPR ${order.subtotal}`, `Total: NPR ${order.total}`);
  const text = lines.join('\n');

  const transport = createTransport();
  if (!transport){
    console.log('=== ORDER EMAIL (console only) ===');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log(text);
    console.log('=================================');
    return;
  }
  await transport.sendMail({ from: `"Sagarmatha Store" <${to}>`, to, subject, text });
}
