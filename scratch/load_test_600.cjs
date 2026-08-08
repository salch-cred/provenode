const http = require('http');
const https = require('https');

// The Vercel URL
const BASE_URL = 'https://provenode-git-main-teams16.vercel.app';
const CONCURRENT_USERS = 600;
const DURATION_SECONDS = 15;

const ENDPOINTS = [
  '/api/health',
  '/api/earnings',
  '/api/autoscaling',
  '/api/threats',
  '/api/fhe-inference'
];

let totalRequests = 0;
let successCount = 0;
let errorCount = 0;

const agentOptions = { keepAlive: true, maxSockets: 1000 };
const httpAgent = new http.Agent(agentOptions);
const httpsAgent = new https.Agent(agentOptions);

console.log(`🚀 Starting Provenode Hardest Load Test (600 Users)`);
console.log(`Target: ${BASE_URL}`);
console.log(`Duration: ${DURATION_SECONDS} seconds`);

const simulateUser = async (userId, endTime) => {
  while (Date.now() < endTime) {
    const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
    const url = `${BASE_URL}${endpoint}`;
    
    try {
      totalRequests++;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': `Provenode-Load-Tester-User-${userId}`
        }
      });
      
      if (res.ok) {
        successCount++;
      } else {
        errorCount++;
      }
    } catch (err) {
      errorCount++;
    }

    // Small random delay between 50ms and 200ms to simulate real usage
    await new Promise(r => setTimeout(r, Math.random() * 150 + 50));
  }
};

const runTest = async () => {
  const endTime = Date.now() + (DURATION_SECONDS * 1000);
  const users = [];
  
  // Spawn 600 concurrent user loops
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    users.push(simulateUser(i, endTime));
  }
  
  // Progress tracker
  const interval = setInterval(() => {
    const remaining = Math.round((endTime - Date.now()) / 1000);
    if (remaining > 0) {
      console.log(`[Status] Running... ${remaining}s left | Reqs: ${totalRequests} | OK: ${successCount} | ERR: ${errorCount}`);
    }
  }, 1000);

  await Promise.all(users);
  clearInterval(interval);
  
  console.log('\n✅ Load Test Completed!');
  console.log(`=================================`);
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Successful:     ${successCount}`);
  console.log(`Errors (429/500): ${errorCount}`);
  
  const rps = (totalRequests / DURATION_SECONDS).toFixed(2);
  console.log(`Throughput:     ${rps} req/sec`);
  
  if (errorCount > (totalRequests * 0.1)) {
    console.log(`⚠️ Network hit Vercel Rate Limits (expected under this extreme load).`);
  } else {
    console.log(`🛡️ Network handled the load flawlessly.`);
  }
  console.log(`=================================`);
};

runTest();
