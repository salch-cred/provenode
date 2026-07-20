export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const rawName = formData.get('name');

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'No file provided.' }, { status: 400 });
    }

    const modelName = (rawName || file.name || 'unnamed-model').toString().slice(0, 120);
    const bytes = await file.arrayBuffer();

    if (bytes.byteLength === 0) {
      return Response.json({ error: 'Uploaded file is empty.' }, { status: 400 });
    }
    if (bytes.byteLength > 100 * 1024 * 1024) {
      return Response.json({ error: 'File exceeds the 100 MB demo limit.' }, { status: 413 });
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const id = crypto.randomUUID();
    const slug = modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
    const configured = Boolean(env.SHELBY_API_KEY);
    const objectId = configured
      ? `shelby://${env.SHELBY_NETWORK || 'shelbynet'}/models/${slug}-${id.slice(0, 8)}`
      : `demo://provenode/models/${slug}-${id.slice(0, 8)}`;

    const record = {
      id,
      model: modelName,
      objectId,
      sha256,
      size: bytes.byteLength,
      mode: configured ? 'shelby' : 'demo',
      createdAt: new Date().toISOString()
    };

    if (env.PROVENODE_DB) {
      await env.PROVENODE_DB.put(`model:${id}`, JSON.stringify(record));
    }

    return Response.json({ success: true, id, objectId, hash: sha256, size: bytes.byteLength, mode: record.mode });
  } catch (err) {
    return Response.json({ error: err.message || 'Upload failed.' }, { status: 500 });
  }
}
