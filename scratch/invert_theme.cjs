const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../src/styles/landing.css');
let css = fs.readFileSync(cssPath, 'utf8');

// 1. Invert base text colors and background
css = css.replace(/--lp-paper:\s*#fdfaf6;/g, '--lp-paper: #020617;\n  --text-primary: #f8fafc;\n  --text-muted: #94a3b8;\n  --border: rgba(255,255,255,0.1);');

// 2. Invert nav backgrounds
css = css.replace(/rgba\(250,248,245,\.60\)/g, 'rgba(2, 6, 23, .60)');
css = css.replace(/rgba\(250,248,245,\.92\)/g, 'rgba(2, 6, 23, .92)');
css = css.replace(/rgba\(250,248,245,\.97\)/g, 'rgba(2, 6, 23, .97)');

// 3. Invert borders and hover states (rgba(26,26,26,x) -> rgba(255,255,255,x))
css = css.replace(/rgba\(26,26,26,\.12\)/g, 'rgba(255,255,255,.12)');
css = css.replace(/rgba\(26,26,26,\.05\)/g, 'rgba(255,255,255,.05)');
css = css.replace(/rgba\(26,26,26,\.09\)/g, 'rgba(255,255,255,.09)');
css = css.replace(/rgba\(26,26,26,\.07\)/g, 'rgba(255,255,255,.07)');
css = css.replace(/rgba\(26,26,26,\.15\)/g, 'rgba(255,255,255,.15)');
css = css.replace(/rgba\(26,26,26,\.04\)/g, 'rgba(255,255,255,.04)');
css = css.replace(/rgba\(26,26,26,\.10\)/g, 'rgba(255,255,255,.10)');
css = css.replace(/rgba\(26,26,26,\.08\)/g, 'rgba(255,255,255,.08)');
css = css.replace(/rgba\(0,0,0,\.05\)/g, 'rgba(255,255,255,.05)');
css = css.replace(/rgba\(0,0,0,\.02\)/g, 'rgba(255,255,255,.02)');
css = css.replace(/border-bottom: 1px solid rgba\(0,0,0,\.06\);/g, 'border-bottom: 1px solid rgba(255,255,255,.1);');
css = css.replace(/border: 1px solid rgba\(0,0,0,\.08\);/g, 'border: 1px solid rgba(255,255,255,.1);');
css = css.replace(/border: 1px solid rgba\(0,0,0,\.15\);/g, 'border: 1px solid rgba(255,255,255,.15);');

// 4. Invert specific background colors
css = css.replace(/background: #fff;/g, 'background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1);');
css = css.replace(/background: #faf8f5;/g, 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);');
css = css.replace(/background: #f4f0eb;/g, 'background: rgba(255,255,255,0.04);');
css = css.replace(/background: rgba\(0,0,0,\.03\);/g, 'background: rgba(255,255,255,0.03);');

// 5. Hardcoded colors that need inversion
css = css.replace(/color: #666;/g, 'color: #94a3b8;');
css = css.replace(/color: #333;/g, 'color: #f8fafc;');
css = css.replace(/color: #111;/g, 'color: #fff;');
css = css.replace(/color: #888;/g, 'color: #64748b;');

fs.writeFileSync(cssPath, css, 'utf8');
console.log('Successfully inverted landing.css to dark mode!');
