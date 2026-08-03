export async function onRequestGet(context) {
  const { request, env, params } = context;
  const id = params.id;
  
  const data = await env.PROVENODE_DB.get(`deployment:${id}`);
  
  if (!data) {
    return Response.json({ success: false, error: "Manifest not found" }, { status: 404 });
  }
  
  const manifest = JSON.parse(data);
  
  // Format the output exactly as the agent expects
  const agentManifest = {
    model: manifest.model,
    version: manifest.version,
    region: manifest.region,
    sha256: manifest.sha256,
    shelbyObjectId: manifest.shelbyObjectId,
    // Provide a dummy download URL since we don't have R2 set up yet
    downloadUrl: `https://example.com/models/${manifest.model.toLowerCase().replace(/\s+/g, '-')}-${manifest.version}.bin`
  };
  
  return Response.json(agentManifest);
}
