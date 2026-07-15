export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  
  if (!id) {
    // List all deployments (simple implementation for dashboard)
    const list = await env.PROVENODE_DB.list({ prefix: "deployment:" });
    const deployments = [];
    for (const key of list.keys) {
      const data = await env.PROVENODE_DB.get(key.name);
      deployments.push(JSON.parse(data));
    }
    // Sort by createdAt descending
    deployments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return Response.json({ success: true, deployments });
  }

  // Get specific deployment
  const manifestData = await env.PROVENODE_DB.get(`deployment:${id}`);
  const devicesData = await env.PROVENODE_DB.get(`devices:${id}`);
  
  if (!manifestData) {
    return Response.json({ success: false, error: "Not found" }, { status: 404 });
  }
  
  const manifest = JSON.parse(manifestData);
  const devices = devicesData ? JSON.parse(devicesData) : { verified: 0, target: 100 };
  
  // Calculate progress based on verified devices
  manifest.progress = Math.min(100, Math.round((devices.verified / devices.target) * 100));
  if (manifest.progress === 100) {
    manifest.status = "verified";
  }
  
  return Response.json({ success: true, manifest, devices });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const data = await request.json();
    const { id, status } = data; // e.g., { id: "manifest-id", status: "verified" }
    
    if (status === "verified") {
      const devicesData = await env.PROVENODE_DB.get(`devices:${id}`);
      if (devicesData) {
        const devices = JSON.parse(devicesData);
        devices.verified += 1; // Increment verified device count
        await env.PROVENODE_DB.put(`devices:${id}`, JSON.stringify(devices));
      }
    }
    
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 400 });
  }
}
