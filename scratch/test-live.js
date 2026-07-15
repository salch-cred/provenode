async function testLiveAPI() {
  console.log("Testing Live Provenode API on Cloudflare Pages...");
  const endpoint = "https://provenode-app.pages.dev/api/deploy";
  
  const payload = {
    modelName: "Live Test Model",
    version: "1.0.0",
    region: "US-East"
  };
  
  console.log(`Sending POST to ${endpoint}`);
  console.log("Payload:", payload);
  
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    console.log(`\nStatus: ${res.status} ${res.statusText}`);
    console.log("Response:", JSON.stringify(data, null, 2));
    
    if (res.ok) {
      console.log("\n✅ SUCCESS: API is correctly handling the real Shelby Testnet upload via Cloudflare Workers!");
    } else {
      console.log("\n❌ FAILED: API returned an error.");
    }
  } catch (err) {
    console.error("\n❌ ERROR:", err.message);
  }
}

testLiveAPI();
