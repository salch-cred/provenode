"""
Provenode Python SDK Client
"""
import os
import time
from pathlib import Path
from typing import Optional, Union, List, Dict, Any

try:
    import requests
except ImportError:
    raise ImportError("pip install requests")


class ProvenodeError(Exception):
    def __init__(self, message, status_code=None, response=None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class ProvenodeClient:
    """
    Provenode API client.

    Usage::

        from provenode import ProvenodeClient

        client = ProvenodeClient("https://provenode.vercel.app")

        # Upload a model
        model = client.upload("./vision_edge.onnx", name="Vision Edge v3")
        print(model.sha256)

        # Deploy it
        deployment = client.deploy(model.id, region="Asia-Pacific", canary=True)
        print(deployment.proof_url)

        # Wait for completion
        deployment = client.wait(deployment.id)
        print(deployment.status)  # "verified"

        # Import from HuggingFace
        model = client.import_huggingface("ultralytics/yolov8n", "yolov8n.onnx")
    """

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        timeout: int = 60,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "provenode-python-sdk/1.0.0"})
        if api_key:
            self.session.headers["Authorization"] = f"Bearer {api_key}"

    def _req(self, method: str, path: str, **kwargs) -> Dict:
        url = f"{self.base_url}{path}"
        kwargs.setdefault("timeout", self.timeout)
        resp = self.session.request(method, url, **kwargs)
        try:
            data = resp.json()
        except Exception:
            data = {"error": resp.text}
        if not resp.ok:
            raise ProvenodeError(
                data.get("error", f"HTTP {resp.status_code}"),
                status_code=resp.status_code,
                response=data,
            )
        return data

    # ── Models ────────────────────────────────────────────────────
    def models(self) -> List[Any]:
        """List all registered models."""
        from . import Model
        return [Model(m) for m in self._req("GET", "/api/models").get("models", [])]

    def upload(
        self,
        path: Union[str, Path],
        name: Optional[str] = None,
        parent_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Any:
        """Upload a model file, compute SHA-256, and register in KV + Shelby."""
        from . import Model
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"Model file not found: {path}")
        fields: Dict[str, Any] = {}
        if name:
            fields["name"] = name
        if parent_id:
            fields["parentId"] = parent_id
        if tags:
            fields["tags"] = ",".join(tags)
        with open(path, "rb") as f:
            data = self._req(
                "POST", "/api/upload",
                files={"file": (path.name, f, "application/octet-stream")},
                data=fields,
            )
        return Model(data)

    def sign(self, model_id: str) -> Dict:
        """Sign a model with the org Ed25519 key."""
        return self._req("POST", "/api/sign", json={"modelId": model_id})

    def lineage(self, model_id: str) -> Dict:
        """Get the lineage graph for a model."""
        return self._req("GET", f"/api/lineage?modelId={model_id}")

    def import_huggingface(
        self,
        repo: str,
        filename: str,
        name: Optional[str] = None,
        revision: str = "main",
    ) -> Any:
        """Import a model directly from HuggingFace Hub."""
        from . import Model
        data = self._req("POST", "/api/import", json={
            "source": "huggingface",
            "repo": repo,
            "filename": filename,
            "name": name,
            "revision": revision,
        })
        if "modelId" in data:
            models = self._req("GET", "/api/models").get("models", [])
            for m in models:
                if m.get("id") == data["modelId"]:
                    return Model(m)
        return data

    # ── Deployments ───────────────────────────────────────────────
    def deploy(
        self,
        model_id: str,
        region: str = "Global",
        canary: bool = False,
        version: Optional[str] = None,
    ) -> Any:
        """Deploy a registered model to the fleet."""
        from . import Deployment
        body: Dict[str, Any] = {"modelId": model_id, "region": region, "canary": canary}
        if version:
            body["version"] = version
        data = self._req("POST", "/api/deploy", json=body)
        return Deployment(data.get("manifest", data))

    def status(self, deployment_id: str) -> Any:
        """Get deployment status."""
        from . import Deployment
        data = self._req("GET", f"/api/status?id={deployment_id}")
        return Deployment(data.get("manifest", data))

    def deployments(self) -> List[Any]:
        """List all deployments."""
        from . import Deployment
        return [Deployment(d) for d in self._req("GET", "/api/status").get("deployments", [])]

    def wait(
        self,
        deployment_id: str,
        poll_interval: int = 5,
        timeout: int = 600,
        on_progress=None,
    ) -> Any:
        """Block until deployment is verified or rolled back."""
        from . import Deployment
        start = time.time()
        while time.time() - start < timeout:
            dep = self.status(deployment_id)
            if on_progress:
                on_progress(dep)
            if dep.status in ("verified", "rolled_back", "failed"):
                return dep
            time.sleep(poll_interval)
        raise TimeoutError(f"Deployment {deployment_id} did not complete within {timeout}s")

    def rollback(self, deployment_id: str) -> Any:
        """Roll back a deployment."""
        from . import Deployment
        data = self._req("POST", f"/api/fleet/canary/{deployment_id}/rollback")
        return Deployment(data.get("manifest", {}))

    def schedule(
        self,
        model_id: str,
        scheduled_for: str,
        region: str = "Global",
        canary: bool = False,
        label: Optional[str] = None,
    ) -> Dict:
        """Schedule a deployment for a future time (ISO 8601 string)."""
        return self._req("POST", "/api/schedule", json={
            "modelId": model_id,
            "scheduledFor": scheduled_for,
            "region": region,
            "canary": canary,
            "label": label,
        })

    # ── Fleet ─────────────────────────────────────────────────────
    def register_device(
        self,
        device_id: str,
        device_type: str = "unknown",
        arch: str = "arm64",
        location: str = "Unknown",
        fleet: str = "default",
    ) -> Dict:
        """Register an edge device."""
        return self._req("POST", "/api/devices", json={
            "deviceId": device_id, "type": device_type,
            "arch": arch, "location": location, "fleet": fleet,
        })

    def devices(self) -> List[Dict]:
        """List all registered devices."""
        return self._req("GET", "/api/devices").get("devices", [])

    def report_health(
        self,
        device_id: str,
        deployment_id: str,
        sha256_match: bool,
        latency_ms: Optional[int] = None,
    ) -> Dict:
        """Device reports completion of model load."""
        body: Dict[str, Any] = {
            "deploymentId": deployment_id,
            "status": "healthy" if sha256_match else "error",
            "sha256Match": sha256_match,
        }
        if latency_ms is not None:
            body["latencyMs"] = latency_ms
        return self._req("POST", f"/api/fleet/{device_id}/report", json=body)

    # ── Analytics ─────────────────────────────────────────────────
    def submit_metric(self, device_id: str, metric: str, value: float) -> Dict:
        """Submit a device metric (latency, error_rate, accuracy, etc.)."""
        return self._req("POST", "/api/analytics", json={
            "deviceId": device_id, "metric": metric, "value": value,
        })

    def analytics(self, device_id: str, metric: str = "latency", days: int = 7) -> Dict:
        """Get time-series analytics for a device."""
        return self._req("GET", f"/api/analytics?deviceId={device_id}&metric={metric}&days={days}")

    # ── Marketplace ───────────────────────────────────────────────
    def marketplace(self) -> List[Dict]:
        """Browse community model marketplace."""
        return self._req("GET", "/api/marketplace").get("listings", [])

    def publish(self, model_id: str, description: str = "", tags: Optional[List[str]] = None) -> Dict:
        """Publish a model to the marketplace."""
        return self._req("POST", "/api/marketplace", json={
            "modelId": model_id, "description": description, "tags": tags or [],
        })

    def import_marketplace(self, listing_id: str) -> Any:
        """Import a marketplace listing into your registry."""
        from . import Model
        data = self._req("POST", "/api/marketplace", json={"action": "import", "listingId": listing_id})
        return Model(data.get("record", {}))

    # ── System ────────────────────────────────────────────────────
    def health(self) -> Dict:
        """Check service health."""
        return self._req("GET", "/api/health")

    def config(self) -> Dict:
        """Get public configuration and feature flags."""
        return self._req("GET", "/api/config")

    def shelby_status(self) -> Dict:
        """Get Shelby integration status."""
        return self._req("GET", "/api/shelby-status")

    def identity(self) -> Dict:
        """Get org on-chain identity."""
        return self._req("GET", "/api/identity")

    def compliance_report(self, from_date: Optional[str] = None, to_date: Optional[str] = None) -> Dict:
        """Generate compliance report."""
        params = {}
        if from_date: params["from"] = from_date
        if to_date: params["to"] = to_date
        return self._req("GET", "/api/compliance/report", params=params)

    def audit_log(self, action: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """Get audit log."""
        params = {"limit": limit}
        if action: params["action"] = action
        return self._req("GET", "/api/audit", params=params).get("records", [])

    def openapi_spec(self) -> Dict:
        """Get OpenAPI specification."""
        return self._req("GET", "/api/docs")
