const https = require('https');

https.get('https://shelbybs.vercel.app/projects', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const regex = /"name":"([^"]+)"/g;
    let matches;
    const names = new Set();
    while ((matches = regex.exec(data)) !== null) {
      if (matches[1].length > 2 && !matches[1].includes('{') && !matches[1].startsWith('/')) {
        names.add(matches[1]);
      }
    }
    console.log([...names].join('\n'));
  });
});
