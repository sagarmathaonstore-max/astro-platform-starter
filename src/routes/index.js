
import express from 'express';
import multer from 'multer';
import path from 'path';
import slugify from 'slugify';
import Stripe from 'stripe';
import { getDb } from '../utils/db.js';
import { sendOrderEmail } from '../utils/mailer.js';
import { requireAdmin, checkAdminLogin } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ dest: 'public/uploads' });

const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function toInt(n){ return parseInt(n, 10) || 0; }
function priceToInt(n){ return Math.round(parseFloat(n) || 0); }

// ======= Public Shop =======
router.get('/', async (req, res) => {
  const db = await getDb();
  const cats = await db.all('SELECT * FROM categories ORDER BY name');
  const products = await db.all('SELECT p.*, c.name as category FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC LIMIT 12');
  res.render('shop/home', { title: 'Home', cats, products });
});

router.get('/category/:slug', async (req, res) => {
  const db = await getDb();
  const cat = await db.get('SELECT * FROM categories WHERE slug = ?', req.params.slug);
  if (!cat) return res.status(404).send('Category not found');
  const products = await db.all('SELECT * FROM products WHERE category_id = ? ORDER BY created_at DESC', cat.id);
  res.render('shop/category', { title: cat.name, cat, products });
});

router.get('/product/:slug', async (req, res) => {
  const db = await getDb();
  const p = await db.get('SELECT p.*, c.name as category, c.slug as cat_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ?', req.params.slug);
  if (!p) return res.status(404).send('Product not found');
  res.render('shop/product', { title: p.title, p });
});

// Cart
router.post('/cart/add', async (req, res) => {
  const { product_id, qty } = req.body;
  const db = await getDb();
  const p = await db.get('SELECT * FROM products WHERE id = ?', product_id);
  if (!p){ req.session.flash = { type: 'error', msg: 'Product not found' }; return res.redirect('back'); }
  const cart = req.session.cart || [];
  const existing = cart.find(i => i.id === p.id);
  const addQty = toInt(qty) || 1;
  if (existing) existing.qty += addQty;
  else cart.push({ id: p.id, title: p.title, price: p.price, image: p.image, qty: addQty });
  req.session.cart = cart;
  req.session.flash = { type: 'success', msg: 'Added to cart' };
  res.redirect('back');
});

router.get('/cart', (req, res) => {
  const cart = req.session.cart || [];
  const subtotal = cart.reduce((s,i)=> s + i.price * i.qty, 0);
  res.render('shop/cart', { title: 'Your Cart', cart, subtotal });
});

router.post('/cart/update', (req, res) => {
  const cart = (req.session.cart || []).map(i => ({...i}));
  for (const id in req.body.qty || {}){
    const item = cart.find(it => it.id === parseInt(id,10));
    if (item){
      item.qty = Math.max(1, parseInt(req.body.qty[id],10) || 1);
    }
  }
  req.session.cart = cart;
  res.redirect('/cart');
});

router.post('/cart/remove', (req, res) => {
  const id = parseInt(req.body.id,10);
  const cart = (req.session.cart || []).filter(i => i.id !== id);
  req.session.cart = cart;
  res.redirect('/cart');
});

// Checkout
router.get('/checkout', (req, res) => {
  const cart = req.session.cart || [];
  if (!cart.length){ req.session.flash = { type: 'error', msg: 'Cart is empty' }; return res.redirect('/cart'); }
  const subtotal = cart.reduce((s,i)=> s + i.price * i.qty, 0);
  res.render('shop/checkout', { title: 'Checkout', cart, subtotal, stripePublishable: process.env.STRIPE_PUBLISHABLE_KEY || '' });
});

router.post('/checkout', async (req, res) => {
  const cart = req.session.cart || [];
  if (!cart.length){ req.session.flash = { type: 'error', msg: 'Cart is empty' }; return res.redirect('/cart'); }
  const { name, email, phone, address, city, region, valley, payment_method } = req.body;
  const inside_valley = valley === 'inside' ? 1 : 0;
  const delivery_fee = inside_valley ? 100 : 180; // as requested
  const subtotal = cart.reduce((s,i)=> s + i.price * i.qty, 0);
  const total = subtotal + delivery_fee;

  if (payment_method === 'card' && stripe){
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: cart.map(i => ({
        price_data: {
          currency: 'npr',
          product_data: { name: i.title },
          unit_amount: i.price * 100,
        },
        quantity: i.qty
      })),
      success_url: `${process.env.BASE_URL || 'http://localhost:3000'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/checkout/cancel`,
      metadata: { name, email, phone, address, city, region, valley }
    });
    const db = await getDb();
    await db.run(
      'INSERT INTO orders (customer_name,email,phone,address,city,region,inside_valley,delivery_fee,items_json,subtotal,total,payment_method,payment_status,stripe_session_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      name, email, phone, address, city, region, inside_valley, delivery_fee, JSON.stringify(cart), subtotal, total, 'card', 'pending', session.id
    );
    return res.redirect(session.url);
  }

  // COD
  const db = await getDb();
  const result = await db.run(
    'INSERT INTO orders (customer_name,email,phone,address,city,region,inside_valley,delivery_fee,items_json,subtotal,total,payment_method,payment_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    name, email, phone, address, city, region, inside_valley, delivery_fee, JSON.stringify(cart), subtotal, total, 'cod', 'unpaid'
  );
  const order = await db.get('SELECT * FROM orders WHERE id = ?', result.lastID);
  await sendOrderEmail(order);
  req.session.cart = [];
  res.redirect('/checkout/success?order_id=' + result.lastID);
});

router.get('/checkout/success', async (req, res) => {
  const { session_id, order_id } = req.query;
  const db = await getDb();

  if (session_id && stripe){
    const s = await stripe.checkout.sessions.retrieve(session_id);
    if (s && s.payment_status === 'paid'){
      await db.run('UPDATE orders SET payment_status = ? WHERE stripe_session_id = ?', 'paid', session_id);
      const order = await db.get('SELECT * FROM orders WHERE stripe_session_id = ?', session_id);
      await sendOrderEmail(order);
      req.session.cart = [];
      return res.render('shop/success', { title: 'Order Successful', orderId: order.id });
    }
    return res.render('shop/success', { title: 'Order Status', orderId: null, note: 'Payment not confirmed.' });
  }

  if (order_id){
    return res.render('shop/success', { title: 'Order Successful', orderId: order_id });
  }

  res.redirect('/');
});

router.get('/checkout/cancel', (req, res) => {
  req.session.flash = { type: 'error', msg: 'Payment cancelled' };
  res.redirect('/cart');
});

// ======= Admin =======
router.get('/admin/login', (req, res) => {
  res.render('admin/login', { title: 'Admin Login' });
});

router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (await checkAdminLogin(email, password)){
    req.session.adminAuthed = true;
    res.redirect('/admin');
  } else {
    req.session.flash = { type: 'error', msg: 'Invalid credentials' };
    res.redirect('/admin/login');
  }
});

router.get('/admin/logout', (req, res) => {
  req.session.adminAuthed = false;
  res.redirect('/admin/login');
});

router.get('/admin', requireAdmin, async (req, res) => {
  const db = await getDb();
  const stats = {
    products: (await db.get('SELECT COUNT(*) as c FROM products')).c,
    categories: (await db.get('SELECT COUNT(*) as c FROM categories')).c,
    orders: (await db.get('SELECT COUNT(*) as c FROM orders')).c,
  };
  res.render('admin/dashboard', { title: 'Dashboard', stats });
});

router.get('/admin/categories', requireAdmin, async (req, res) => {
  const db = await getDb();
  const cats = await db.all('SELECT * FROM categories ORDER BY name');
  res.render('admin/categories', { title: 'Categories', cats });
});

router.post('/admin/categories', requireAdmin, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name){ req.session.flash = { type: 'error', msg: 'Name required' }; return res.redirect('/admin/categories'); }
  const slug = slugify(name, { lower: true, strict: true });
  const db = await getDb();
  try {
    await db.run('INSERT INTO categories (name, slug) VALUES (?,?)', name, slug);
    req.session.flash = { type: 'success', msg: 'Category added' };
  } catch(e){ req.session.flash = { type: 'error', msg: 'Slug already exists' }; }
  res.redirect('/admin/categories');
});

router.post('/admin/categories/:id/delete', requireAdmin, async (req, res) => {
  const db = await getDb();
  await db.run('DELETE FROM categories WHERE id = ?', req.params.id);
  res.redirect('/admin/categories');
});

router.get('/admin/products', requireAdmin, async (req, res) => {
  const db = await getDb();
  const products = await db.all('SELECT p.*, c.name as category FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC');
  const cats = await db.all('SELECT * FROM categories ORDER BY name');
  res.render('admin/products', { title: 'Products', products, cats });
});

router.post('/admin/products', requireAdmin, upload.single('imagefile'), async (req, res) => {
  const { title, description, price, stock, category_id, image } = req.body;
  const slug = slugify(title, { lower: true, strict: true });
  const img = req.file ? ('/public/uploads/' + req.file.filename) : (image || '');
  const db = await getDb();
  try {
    await db.run(
      'INSERT INTO products (title, slug, description, price, stock, image, category_id) VALUES (?,?,?,?,?,?,?)',
      title, slug, description, Math.round(parseFloat(price)||0), parseInt(stock,10)||0, img, parseInt(category_id,10) || None
    );
    req.session.flash = { type: 'success', msg: 'Product added' };
  } catch(e){
    req.session.flash = { type: 'error', msg: 'Slug already exists' };
  }
  res.redirect('/admin/products');
});

router.post('/admin/products/:id/delete', requireAdmin, async (req, res) => {
  const db = await getDb();
  await db.run('DELETE FROM products WHERE id = ?', req.params.id);
  res.redirect('/admin/products');
});

router.get('/admin/orders', requireAdmin, async (req, res) => {
  const db = await getDb();
  const orders = await db.all('SELECT * FROM orders ORDER BY created_at DESC');
  res.render('admin/orders', { title: 'Orders', orders });
});

export default router;
