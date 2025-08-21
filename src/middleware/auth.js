
import bcrypt from 'bcryptjs';

export function requireAdmin(req, res, next){
  if (req.session && req.session.adminAuthed) return next();
  res.redirect('/admin/login');
}

export async function checkAdminLogin(email, password){
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const hash = process.env.ADMIN_PASSWORD_HASH || '$2a$10$gOaSxFvB2BfR7J1y5m8w8e5nYj5n9o9iE6FJ1pStl2Tt7v7wL6p7G'; // 'admin123'
  if (email.toLowerCase() !== adminEmail) return false;
  return await bcrypt.compare(password, hash);
}
