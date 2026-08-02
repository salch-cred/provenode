"""
Provenode Python SDK
Upload, deploy, and manage verified AI models on Shelby shelbynet.

Install: pip install provenode-sdk
"""

__version__ = "1.0.0"
__all__ = ["ProvenodeClient", "Model", "Deployment", "ProvenodeError"]

from .client import ProvenodeClient, ProvenodeError

class Model:
    def __init__(self, data):
        self.id = data.get("id")
        self.name = data.get("model")
        self.sha256 = data.get("sha256")
        self.size = data.get("size")
        self.mode = data.get("mode")
        self.object_id = data.get("objectId")
        self.expires_at = data.get("expiresAt")
        self.tags = data.get("tags", [])
        self.created_at = data.get("createdAt")
        self._raw = data

    @property
    def proof_url(self):
        return f"?id={self.id}&name={self.name}&hash={self.sha256}"

    def __repr__(self):
        return f"<Model id={self.id[:8]}… name={self.name!r} mode={self.mode}>"


class Deployment:
    def __init__(self, data):
        self.id = data.get("id")
        self.model = data.get("model")
        self.version = data.get("version")
        self.status = data.get("status")
        self.progress = data.get("progress", 0)
        self.region = data.get("region")
        self.sha256 = data.get("sha256")
        self.shelby_object_id = data.get("shelbyObjectId")
        self.manifest_object_id = data.get("manifestObjectId")
        self.mode = data.get("mode")
        self.canary = data.get("canary")
        self.created_at = data.get("createdAt")
        self._raw = data

    def __repr__(self):
        return f"<Deployment id={self.id[:8]}… model={self.model!r} status={self.status} {self.progress}%>"
