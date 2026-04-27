const http = require('http');

http.get('http://localhost:3000/api/market', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json.data.slice(0, 3), null, 2));
    } catch (e) {
      console.log('Parse Error:', e.message);
      console.log('Response:', data.substring(0, 200));
    }
  });
});
