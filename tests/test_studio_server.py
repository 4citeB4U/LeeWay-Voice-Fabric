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
from unittest.mock import patch, Mock
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


    def test_local_catalog_has_six_distinct_speakers_and_no_reference_requirement(self):
        with patch.object(studio, "local_request") as upstream:
            status, body, _ = self.request("GET", "/api/local/voices")
            self.assertEqual(status, 200)
            voices = body["voices"]
            self.assertEqual(len({v["voiceId"] for v in voices}), 6)
            self.assertEqual(sum(v["gender"] == "female" for v in voices), 3)
            self.assertEqual(sum(v["gender"] == "male" for v in voices), 3)
            self.assertTrue(all(v["provider"] == "kokoro" and v["referenceUrl"] is None for v in voices))
            upstream.assert_not_called()

    def test_local_validation_and_origin_block_before_synthesis(self):
        with patch.object(studio, "local_request") as upstream, patch.object(studio, "CLONE", None):
            for body in ({"text":"Hello", "voicePackageId":"kokoro-af_fake"},
                         {"text":"Hello", "voicePackageId":"../agent-lee-voice-one"},
                         {"text":" ", "voicePackageId":"kokoro-af_heart"},
                         {"text":"a"*1501, "voicePackageId":"kokoro-af_heart"},
                         {"text":42, "voicePackageId":"kokoro-af_heart"}, [], {}):
                self.assertEqual(self.request("POST", "/api/local/synthesize", body)[0], 400)
            valid = {"text":"Hello", "voicePackageId":"kokoro-af_heart"}
            self.assertEqual(self.request("POST", "/api/local/synthesize", valid, {"Origin":"https://evil.example"})[0],403)
            self.assertEqual(self.request("POST", "/api/local/synthesize", valid, {"Content-Type":"text/plain"})[0],415)
            self.assertEqual(self.request("POST", "/api/local/synthesize", valid, {"Transfer-Encoding":"chunked"})[0],400)
            self.assertEqual(self.request("POST", "/api/local/synthesize", {"text":"a"*40000})[0],400)
            upstream.assert_not_called()

    def test_local_kokoro_routes_fixed_voice_and_text_without_client_url_override(self):
        fixture = {"audioContent":base64.b64encode(b"RIFF0000WAVEfixture").decode(),"format":"wav","sampleRate":24000}
        with patch.object(studio, "local_request", return_value=fixture) as upstream:
            code, body, _ = self.request("POST", "/api/local/synthesize", {
                "voicePackageId":"kokoro-af_heart","text":"Fixture only.","url":"https://evil.example","voiceId":"af_fake"})
            self.assertEqual(code,200)
            self.assertEqual(body,fixture)
            upstream.assert_called_once_with(studio.KOKORO_URL, '/synthesize', {'voiceId':'af_heart','text':'Fixture only.'}, timeout=180)

    def test_local_clone_fallback_converts_only_generated_basename_to_audio_route(self):
        wav = b"RIFF0000WAVEfixture"
        with patch.object(studio, "CLONE", None), patch.object(studio, "local_request", side_effect=[{"audio_path":"/app/output/agent-lee-fixture.wav"},wav]) as upstream:
            code, body, _ = self.request("POST", "/api/local/synthesize", {"voicePackageId":"agent-lee-voice-one","text":"Fixture only."})
            self.assertEqual(code,200)
            self.assertEqual(base64.b64decode(body['audioContent']),wav)
            self.assertEqual(upstream.call_args_list[0].args[1],'/tts')
            self.assertEqual(upstream.call_args_list[0].args[2]['voice'],'LEEWAY_VOICE::AGENT_LEE::DEFAULT_CLONE')
            self.assertEqual(upstream.call_args_list[1].args,(studio.XTTS_URL,'/audio/agent-lee-fixture.wav'))
            self.assertGreaterEqual(body['metrics']['generationMs'],0)
        with patch.object(studio, "CLONE", None), patch.object(studio, "local_request", return_value={"audio_path":"file.wav?private=secret"}) as upstream:
            self.assertEqual(self.request("POST", "/api/local/synthesize", {"voicePackageId":"agent-lee-voice-one","text":"Fixture"})[0],503)
            self.assertEqual(upstream.call_count,1)

    def test_local_preview_allowlist_and_missing_preview(self):
        with patch.object(studio, "local_request", return_value=b'RIFF0000WAVEfixture') as upstream:
            code, body, headers = self.request('GET','/api/local/preview/af_bella')
            self.assertEqual(code,200); self.assertEqual(headers['Content-Type'],'audio/wav')
            self.assertEqual(body,b'RIFF0000WAVEfixture')
            upstream.assert_called_once_with(studio.KOKORO_URL,'/preview/af_bella',binary=True)
            self.assertEqual(self.request('GET','/api/local/preview/af_invented')[0],404)
            self.assertEqual(upstream.call_count,1)
        with patch.object(studio,'local_request',side_effect=ValueError('private-diagnostic-token')):
            code, body, _ = self.request('GET','/api/local/preview/af_bella')
            self.assertEqual(code,404); self.assertNotIn('private-diagnostic-token',str(body))

    def test_local_service_failures_are_reported_without_private_details(self):
        with patch.object(studio,'local_request',side_effect=OSError('private-diagnostic-token')), patch.object(studio,'CLONE',None):
            code, body, _ = self.request('GET','/api/local/status')
            self.assertEqual(code,200); self.assertFalse(body['kokoro']['ready']);self.assertFalse(body['xtts']['ready'])
            self.assertNotIn('private-diagnostic-token',str(body))
            code, body, _ = self.request('POST','/api/local/synthesize',{'voicePackageId':'kokoro-af_heart','text':'Fixture'})
            self.assertEqual(code,503);self.assertNotIn('private-diagnostic-token',str(body))

    def test_local_transport_limits_large_response(self):
        class Oversized:
            def __enter__(self): return self
            def __exit__(self,*_): pass
            def read(self,limit): return b'x'*limit
        with patch.object(studio,'urlopen',return_value=Oversized()):
            with self.assertRaisesRegex(ValueError,'too large'):
                studio.local_request(studio.KOKORO_URL,'/synthesize',binary=True)


if __name__ == "__main__":
    unittest.main()
