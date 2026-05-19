const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace standard red utilities with brand variables
content = content.replace(/bg-red-600\/(\d+)/g, 'bg-[var(--color-brand-main)]/$1');
content = content.replace(/bg-red-600(?![\/\-\w])/g, 'bg-brand-main');

content = content.replace(/hover:bg-red-600\/(\d+)/g, 'hover:bg-[var(--color-brand-main)]/$1');
content = content.replace(/hover:bg-red-600(?![\/\-\w])/g, 'hover:bg-brand-main');

content = content.replace(/hover:bg-red-700/g, 'hover:bg-brand-light');
content = content.replace(/hover:bg-red-500/g, 'hover:bg-brand-light');

content = content.replace(/text-red-500/g, 'text-brand-light');
content = content.replace(/text-red-600/g, 'text-brand-main');

content = content.replace(/border-red-500/g, 'border-brand-main');
content = content.replace(/border-red-600/g, 'border-brand-main');

content = content.replace(/shadow-red-900\/20/g, 'shadow-[0_0_20px_var(--color-brand-dark)]');
content = content.replace(/shadow-\[0_0_15px_rgba\(220,38,38,0\.6\)\]/g, 'shadow-[0_0_20px_var(--color-brand-dark)]');
content = content.replace(/shadow-\[0_0_30px_rgba\(220,38,38,0\.3\)\]/g, 'shadow-[0_0_30px_var(--color-brand-dark)]');
content = content.replace(/shadow-\[0_0_10px_red\]/g, 'shadow-[0_0_10px_var(--color-brand-dark)]');

content = content.replace(/shadow-\[0_0_15px_var\(--color-brand-dark\)\]/g, 'shadow-[0_0_25px_var(--color-brand-dark)]');

fs.writeFileSync('src/App.tsx', content);
