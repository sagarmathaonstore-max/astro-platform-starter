
import fs from 'fs';
const dirs = ['public/uploads'];
dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
console.log('Postinstall: ensured uploads directory exists');
