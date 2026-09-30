"""Mocked provider contract and real loopback HTTP boundary tests; no paid calls."""
import base64
from functools import partial
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

PATH = Path(__file__).resolve().parents[1] / "adapters" / "studio-server.py"
spec = importlib.util.spec_from_file_location("studio_server", PATH)
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)


class StudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        Path(cls.temp.name, "index.html").write_text("studio", encoding="utf-8")
        Path(cls.temp.name, ".env").write_text("private", encoding="utf-8")
        cls.server = studio.ThreadingHTTPServer(("127.0.0.1", 0), partial(studio.StudioHandler, directory=cls.temp.name))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def setUp(self):
        self.env = patch.dict(os.environ, {"RESEMBLE_API_KEY": "", "LEEWAY_ALLOWED_ORIGINS": ""})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        raw = json.dumps(body) if body is not None else None
        hdr = {"Content-Type": "application/json"} if body is not None else {}
        hdr.update(headers or {})
        conn.request(method, path, body=raw, headers=hdr)
        response = conn.getresponse()
        data, result_headers = response.read(), dict(response.getheaders())
        status = response.status
        conn.close()
        try:
            data = json.loads(data)
        except ValueError:
            pass
        return status, data, result_headers

    def test_status_and_missing_key_do_not_call_provider(self):
        with patch.object(studio, "provider_request") as request:
            self.assertEqual(self.request("GET", "/api/provider/status")[1], {"resemble": {"configured": False}})
            self.assertEqual(self.request("GET", "/api/resemble/voices")[0], 503)
            self.assertEqual(self.request("POST", "/api/resemble/synthesize", {"voiceUuid": "fixture", "text": "Test"})[0], 503)
            request.assert_not_called()

    def test_origin_and_host_guards(self):
        self.assertEqual(self.request("GET", "/api/provider/status", headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.request("GET", "/api/provider/status", headers={"Host": "evil.example"})[0], 403)
        origin = f"http://127.0.0.1:{self.port}"
        self.assertEqual(self.request("GET", "/api/provider/status", headers={"Origin": origin})[2]["Access-Control-Allow-Origin"], origin)
        with patch.dict(os.environ, {"LEEWAY_ALLOWED_ORIGINS": "http://localhost:8876"}):
            result = self.request("OPTIONS", "/api/resemble/synthesize", headers={"Origin": "http://localhost:8876"})
            self.assertEqual(result[0], 204)
            self.assertEqual(result[2]["Access-Control-Allow-Origin"], "http://localhost:8876")
        with patch.dict(os.environ, {"LEEWAY_ALLOWED_ORIGINS": "*"}):
            self.assertEqual(self.request("GET", "/api/provider/status", headers={"Origin": "https://evil.example"})[0], 403)

    def test_input_validation_precedes_provider(self):
        with patch.object(studio, "provider_request") as request:
            for body in ({"voiceUuid": "../bad", "text": "Hello"}, {"voiceUuid": "fixture", "text": " "},
                         {"voiceUuid": "fixture", "text": "a" * 3001}, [], {"voiceUuid": None, "text": "Hello"}):
                self.assertEqual(self.request("POST", "/api/resemble/synthesize", body)[0], 400)
            self.assertEqual(self.request("POST", "/api/resemble/synthesize", {}, {"Content-Type": "text/plain"})[0], 415)
            self.assertEqual(self.request("GET", "/api/resemble/voices?page=-1")[0], 400)
            self.assertEqual(self.request("GET", "/api/resemble/voices?gender=%3Cbad%3E")[0], 400)
            request.assert_not_called()

    def test_voice_mapping_and_filter(self):
        fixture = {"items": [{"uuid": "test-voice", "name": "Fixture", "gender": "female",
                               "sample_url": "https://example.org/preview.wav"}, {"name": "missing id"}], "page_count": 3}
        with patch.dict(os.environ, {"RESEMBLE_API_KEY": "test-only-secret"}), patch.object(studio, "provider_request", return_value=fixture) as call:
            status, body, _ = self.request("GET", "/api/resemble/voices?page=2&gender=female")
            self.assertEqual(status, 200)
            self.assertEqual(body["numPages"], 3)
            self.assertEqual(body["voices"][0]["id"], "resemble-test-voice")
            self.assertEqual(body["voices"][0]["gender"], "female")
            self.assertEqual(len(body["voices"]), 1)
            self.assertIn("pre_built_resemble_voice=true", call.call_args.args[0])
            self.assertIn("gender=female", call.call_args.args[0])
            self.assertNotIn("test-only-secret", json.dumps(body))

    def test_synthesis_exact_contract(self):
        content = base64.b64encode(b"RIFF\x00\x00\x00\x00WAVEfixture").decode()
        with patch.dict(os.environ, {"RESEMBLE_API_KEY": "test-only-secret"}), patch.object(studio, "provider_request", return_value={"audio_content": content}) as call:
            status, body, _ = self.request("POST", "/api/resemble/synthesize", {"voiceUuid": "test-voice", "text": "Fixture only."})
            self.assertEqual(status, 200)
            self.assertEqual(body, {"audioContent": content, "format": "wav", "sampleRate": 48000})
            self.assertEqual(call.call_args.args[0], "https://f.cluster.resemble.ai/synthesize")
            self.assertEqual(call.call_args.args[2], {"voice_uuid": "test-voice", "data": "Fixture only.", "output_format": "wav", "precision": "PCM_16", "sample_rate": 48000})

    def test_static_hidden_and_traversal(self):
        self.assertEqual(self.request("GET", "/index.html")[0], 200)
        for path in ("/.env", "/%2eenv", "/.git/config", "/../private", "/__pycache__/x.pyc", "/%5c..%5cprivate"):
            self.assertEqual(self.request("GET", path)[0], 403, path)

    def test_transport_bearer_and_sanitized_error(self):
        with patch.object(studio, "urlopen", return_value=io.BytesIO(b'{"success":true}')) as call:
            studio.provider_request("https://f.cluster.resemble.ai/synthesize", "test-only-secret", {"data": "fixture"})
            request = call.call_args.args[0]
            self.assertEqual(request.get_header("Authorization"), "Bearer test-only-secret")
            self.assertEqual(json.loads(request.data), {"data": "fixture"})
        error = HTTPError("https://provider", 401, "test-only-secret", {}, io.BytesIO(b"test-only-secret"))
        with patch.object(studio, "urlopen", side_effect=error):
            with self.assertRaises(studio.ProviderError) as caught:
                studio.provider_request("https://provider", "test-only-secret")
            self.assertNotIn("test-only-secret", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
