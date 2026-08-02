/**
 * OpenAPI 3.1 spec — GET /api/docs
 * Auto-generated from source of truth. Powers Swagger UI.
 */
export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Provenode API',
      version: '3.0.0',
      description: 'Production-grade verified AI model deployment on Shelby shelbynet. All models are SHA-256 hashed and optionally uploaded as immutable Shelby objects.',
      contact: { name: 'Provenode', url: 'https://github.com/salch-cred/provenode' },
      license: { name: 'MIT' },
    },
    servers: [{ url: base, description: 'Production' }],
    tags: [
      { name: 'Models', description: 'Model registry operations' },
      { name: 'Deploy', description: 'Deployment management' },
      { name: 'Fleet', description: 'Device fleet and OTA' },
      { name: 'Shelby', description: 'Shelby Protocol integration' },
      { name: 'Analytics', description: 'Metrics and observability' },
      { name: 'System', description: 'Health and configuration' },
    ],
    paths: {
      '/api/health':        { get: { tags:['System'], summary:'Health check', responses:{ '200':{ description:'Service healthy' } } } },
      '/api/config':        { get: { tags:['System'], summary:'Public configuration and feature flags', responses:{ '200':{ description:'Config object' } } } },
      '/api/models':        { get: { tags:['Models'], summary:'List all registered models', responses:{ '200':{ description:'Model list' } } } },
      '/api/upload':        { post: { tags:['Models'], summary:'Upload and register a model (multipart)', requestBody:{ required:true, content:{ 'multipart/form-data':{ schema:{ type:'object', properties:{ file:{type:'string',format:'binary'}, name:{type:'string'}, parentId:{type:'string'}, tags:{type:'string'} } } } } }, responses:{ '200':{ description:'Registration result with SHA-256 and Shelby object ID' } } } },
      '/api/deploy':        { post: { tags:['Deploy'], summary:'Deploy a model to the fleet', requestBody:{ required:true, content:{ 'application/json':{ schema:{ type:'object', properties:{ modelId:{type:'string'}, region:{type:'string'}, canary:{type:'boolean'} } } } } }, responses:{ '200':{ description:'Deployment manifest' } } } },
      '/api/status':        { get: { tags:['Deploy'], summary:'Get deployment status', parameters:[{ name:'id', in:'query', schema:{type:'string'} }], responses:{ '200':{ description:'Deployment or list of deployments' } } } },
      '/api/identity':      { get: { tags:['Shelby'], summary:'Get org on-chain identity', responses:{ '200':{ description:'Org address and public key' } } } },
      '/api/objects':       { get: { tags:['Shelby'], summary:'List Shelby objects with expiry status', responses:{ '200':{ description:'Object list with health status' } } } },
      '/api/lineage':       { get: { tags:['Models'], summary:'Get model lineage graph', parameters:[{ name:'modelId', in:'query', required:true, schema:{type:'string'} }], responses:{ '200':{ description:'Ancestors and descendants' } } } },
      '/api/import':        { post: { tags:['Models'], summary:'Import from HuggingFace Hub', requestBody:{ required:true, content:{ 'application/json':{ schema:{ type:'object', required:['source','repo','filename'], properties:{ source:{type:'string',enum:['huggingface']}, repo:{type:'string',example:'ultralytics/yolov8n'}, filename:{type:'string',example:'yolov8n.onnx'} } } } } }, responses:{ '200':{ description:'Import result' } } } },
      '/api/devices':       { get: { tags:['Fleet'], summary:'List registered devices', responses:{ '200':{ description:'Device list' } } }, post: { tags:['Fleet'], summary:'Register a device', responses:{ '201':{ description:'Registered device' } } } },
      '/api/fleet':         { get: { tags:['Fleet'], summary:'OTA pending + canary status', responses:{ '200':{ description:'OTA or canary data' } } } },
      '/api/abtest':        { get: { tags:['Analytics'], summary:'List A/B tests', responses:{ '200':{ description:'Test list' } } }, post: { tags:['Analytics'], summary:'Create A/B test', responses:{ '201':{ description:'Created test' } } } },
      '/api/analytics':     { get: { tags:['Analytics'], summary:'Device analytics time series', responses:{ '200':{ description:'Time series data' } } }, post: { tags:['Analytics'], summary:'Submit a device metric', responses:{ '200':{ description:'OK' } } } },
      '/api/marketplace':   { get: { tags:['Models'], summary:'Browse community model marketplace', responses:{ '200':{ description:'Listing array' } } }, post: { tags:['Models'], summary:'Publish or import marketplace model', responses:{ '200':{ description:'Result' } } } },
      '/api/webhooks':      { get: { tags:['System'], summary:'List webhooks', responses:{ '200':{ description:'Webhook list' } } }, post: { tags:['System'], summary:'Register webhook', responses:{ '201':{ description:'Created webhook' } } } },
      '/api/schedule':      { get: { tags:['Deploy'], summary:'List scheduled deployments', responses:{ '200':{ description:'Scheduled job list' } } }, post: { tags:['Deploy'], summary:'Schedule a deployment', responses:{ '201':{ description:'Scheduled job' } } } },
      '/api/groups':        { get: { tags:['Fleet'], summary:'List fleet groups', responses:{ '200':{ description:'Group list' } } }, post: { tags:['Fleet'], summary:'Create fleet group', responses:{ '201':{ description:'Created group' } } } },
      '/api/bluegreen':     { get: { tags:['Deploy'], summary:'Blue-green configs', responses:{ '200':{ description:'Config list' } } }, post: { tags:['Deploy'], summary:'Create or switch blue-green slot', responses:{ '200':{ description:'Config' } } } },
      '/api/audit':         { get: { tags:['System'], summary:'Immutable audit log', responses:{ '200':{ description:'Audit records' } } } },
      '/api/compliance':    { get: { tags:['System'], summary:'Compliance report', parameters:[{ name:'from',in:'query',schema:{type:'string',format:'date'}},{name:'to',in:'query',schema:{type:'string',format:'date'}},{name:'format',in:'query',schema:{type:'string',enum:['json','csv']}}], responses:{ '200':{ description:'Report' } } } },
      '/api/metrics':       { get: { tags:['Analytics'], summary:'Prometheus metrics', responses:{ '200':{ description:'text/plain Prometheus format' } } } },
      '/api/stream':        { get: { tags:['Deploy'], summary:'SSE live deployment stream', parameters:[{ name:'deploymentId', in:'query', required:true, schema:{type:'string'} }], responses:{ '200':{ description:'text/event-stream' } } } },
    },
  };

  return res.status(200).json(spec);
}
