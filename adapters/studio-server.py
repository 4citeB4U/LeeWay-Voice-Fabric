#!/usr/bin/env python3
"""Optional loopback studio server; Python standard library only.

RESEMBLE_API_KEY stays server-side. Hosted calls require the developer's account.
Reference: https://docs.resemble.ai/voice-creation/voices/list
Reference: https://docs.resemble.ai/api-reference/text-to-speech/synthesize
The current API reference specifies Bearer authentication and voice-selected model.
"""
import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlencode, urlsplit
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from local_clone import CloneWorker
from voice_selection_owner import handle_owner_selection, private_selection_path

LOCAL_VOICES = [('af_alloy', 'Alloy', 'female'), ('af_aoede', 'Aoede', 'female'), ('af_bella', 'Bella', 'female'), ('af_heart', 'Heart', 'female'), ('af_jessica', 'Jessica', 'female'), ('af_kore', 'Kore', 'female'), ('af_nicole', 'Nicole', 'female'), ('af_nova', 'Nova', 'female'), ('af_river', 'River', 'female'), ('af_sarah', 'Sarah', 'female'), ('af_sky', 'Sky', 'female'), ('am_adam', 'Adam', 'male'), ('am_echo', 'Echo', 'male'), ('am_eric', 'Eric', 'male'), ('am_fenrir', 'Fenrir', 'male'), ('am_liam', 'Liam', 'male'), ('am_michael', 'Michael', 'male'), ('am_onyx', 'Onyx', 'male'), ('am_puck', 'Puck', 'male'), ('am_santa', 'Santa', 'male'), ('bf_alice', 'Alice', 'female'), ('bf_emma', 'Emma', 'female'), ('bf_isabella', 'Isabella', 'female'), ('bf_lily', 'Lily', 'female'), ('bm_daniel', 'Daniel', 'male'), ('bm_fable', 'Fable', 'male'), ('bm_george', 'George', 'male'), ('bm_lewis', 'Lewis', 'male')]
KOKORO_URL = os.environ.get('LEEWAY_KOKORO_URL', 'http://127.0.0.1:8878').rstrip('/')
XTTS_URL = os.environ.get('LEEWAY_XTTS_URL', 'http://127.0.0.1:8092').rstrip('/')
CLONE = None

def local_request(base, route, payload=None, timeout=3, binary=False):
    data = None if payload is None else json.dumps(payload).encode('utf-8')
    req = Request(base+route, data=data, headers={'Content-Type':'application/json'})
    with urlopen(req, timeout=timeout) as response:
        raw = response.read(24*1024*1024+1)
    if len(raw)>24*1024*1024:
        raise ValueError('Local response is too large')
    return raw if binary else json.loads(raw)

def local_status():
    try:
        kokoro = local_request(KOKORO_URL, '/status')
    except Exception:
        kokoro = {'ready':False,'state':'unavailable','message':'Start the local Kokoro adapter.'}
    if CLONE and CLONE.container:
        xtts = {'ready':CLONE.ready,'message':CLONE.error or ('Clone ready.' if CLONE.ready else 'Clone is warming up.')}
    else:
        try:
            health = local_request(XTTS_URL, '/health')
            xtts = {'ready':bool(health.get('model_loaded')), 'message':'Existing clone service.'}
        except Exception:
            xtts = {'ready':False,'message':'Local clone service unavailable.'}
    return {'kokoro':kokoro,'xtts':xtts}

def shared_provider_ready(profile):
    """Check the selected existing provider before publishing its shared binding."""
    if profile.get('provider') == 'kokoro':
        try:
            state = local_request(KOKORO_URL, '/status')
            return state.get('ready') is True and profile.get('voiceId') in state.get('voices', [])
        except Exception:
            return False
    return profile.get('id') == 'agent-lee-voice-one' and local_status().get('xtts', {}).get('ready') is True

MAX_BODY = 32 * 1024
MAX_PROVIDER_RESPONSE = 24 * 1024 * 1024
VOICE_ID = re.compile(r"[A-Za-z0-9_-]{1,128}\Z")


class ProviderError(Exception):
    pass


def provider_request(url, key, payload=None):
    headers = {"Authorization": "Bearer " + key, "Accept": "application/json"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    try:
        with urlopen(Request(url, data=data, headers=headers), timeout=90) as response:
            raw = response.read(MAX_PROVIDER_RESPONSE + 1)
        if len(raw) > MAX_PROVIDER_RESPONSE:
            raise ProviderError("Provider response exceeded the size limit.")
        result = json.loads(raw)
        if not isinstance(result, dict) or result.get("success") is False:
            raise ProviderError("Provider could not complete this request.")
        return result
    except HTTPError as exc:
        # Never forward provider bodies, URLs with query strings, or credentials.
        if exc.code in (401, 403):
            raise ProviderError("Provider authentication or access failed.") from None
        if exc.code == 429:
            raise ProviderError("Provider rate limit reached. Try again later.") from None
        raise ProviderError("Provider request failed.") from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise ProviderError("Provider request failed or returned invalid data.") from None


def safe_text(value, fallback="", limit=500):
    return value[:limit] if isinstance(value, str) else fallback


def voice_metadata(item):
    if not isinstance(item, dict):
        return None
    uuid = item.get("uuid")
    if not isinstance(uuid, str) or not VOICE_ID.fullmatch(uuid):
        return None
    preview = item.get("sample_url") or item.get("preview_url") or ""
    try:
        valid_preview = isinstance(preview, str) and urlsplit(preview).scheme == "https" and bool(urlsplit(preview).hostname)
    except ValueError:
        valid_preview = False
    if not valid_preview:
        preview = ""
    return {
        "id": "resemble-" + uuid,
        "name": safe_text(item.get("name"), "Resemble voice " + uuid, 160),
        "owner": "Resemble AI", "provider": "resemble", "voiceUuid": uuid,
        "gender": safe_text(item.get("gender"), "unspecified", 40),
        "previewUrl": preview, "source": "RESEMBLE_HOSTED",
        "packageType": "HOSTED_VOICE", "pace": 1, "exaggeration": 0.5,
        "description": safe_text(item.get("description")),
    }


class StudioHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        # Paths/query strings and provider text must not become server logs.
        pass

    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = getattr(self, "_approved_origin", None)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _guard(self, api=False):
        port = self.server.server_address[1]
        hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if port == 80:
            hosts.update(("127.0.0.1", "localhost"))
        host = self.headers.get("Host", "").lower()
        if host not in hosts:
            self._json(403, {"error": "Invalid local Host header."})
            return False
        if api:
            origin = self.headers.get("Origin")
            allowed = {"http://" + host}
            allowed.update(x.strip() for x in os.environ.get("LEEWAY_ALLOWED_ORIGINS", "").split(",")
                           if x.strip() and x.strip() != "*")
            if origin and origin not in allowed:
                self._json(403, {"error": "Origin is not allowed."})
                return False
            self._approved_origin = origin
        return True

    def _key(self):
        key = os.environ.get("RESEMBLE_API_KEY", "").strip()
        if not key:
            self._json(503, {"configured": False, "error": "Set RESEMBLE_API_KEY on the local server to use Resemble hosted voices."})
            return None
        return key

    def do_OPTIONS(self):
        if not self._guard(api=True):
            return
        if not self.path.startswith("/api/"):
            self._json(404, {"error": "Unknown endpoint."})
            return
        self.send_response(204)
        if getattr(self, "_approved_origin", None):
            self.send_header("Access-Control-Allow-Origin", self._approved_origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if handle_owner_selection(self, shared_provider_ready):
            return
        parsed = urlsplit(self.path)
        is_api = parsed.path.startswith("/api/")
        if not self._guard(api=is_api):
            return
        if parsed.path == "/api/provider/status":
            self._json(200, {"resemble": {"configured": bool(os.environ.get("RESEMBLE_API_KEY", "").strip())}})
        elif parsed.path == '/api/local/status':
            self._json(200, local_status())
        elif parsed.path == '/api/local/voices':
            self._json(200, {'voices':[{'id':'kokoro-'+vid,'voiceId':vid,'name':name+' · Kokoro','owner':'hexgrad / Kokoro',
                'provider':'kokoro','gender':gender,'source':'BUILTIN_LOCAL','packageType':'MODEL_VOICE',
                'pace':1,'exaggeration':0.5,'previewUrl':'/api/local/preview/'+vid,'referenceUrl':None,
                'description':'Distinct local Kokoro model voice. No account or browser model download required.'}
                for vid,name,gender in LOCAL_VOICES]})
        elif parsed.path.startswith('/api/local/preview/'):
            vid = parsed.path.rsplit('/',1)[-1]
            if vid not in [v[0] for v in LOCAL_VOICES]:
                self._json(404, {'error':'Unknown preview'})
            else:
                try:
                    audio = local_request(KOKORO_URL, '/preview/'+vid, binary=True)
                    self.send_response(200)
                    self.send_header('Content-Type','audio/wav')
                    self.send_header('Content-Length',str(len(audio)))
                    self.end_headers()
                    self.wfile.write(audio)
                except Exception:
                    self._json(404, {'error':'Preview is not ready yet.'})
        elif parsed.path == "/api/resemble/voices":
            self._voices(parsed.query)
        elif is_api:
            self._json(404, {"error": "Unknown endpoint."})
        elif self._static_allowed(parsed.path):
            super().do_GET()

    def do_HEAD(self):
        if not self._guard(api=self.path.startswith("/api/")):
            return
        if self.path.startswith("/api/"):
            self._json(405, {"error": "Use GET for this endpoint."})
        elif self._static_allowed(urlsplit(self.path).path):
            super().do_HEAD()

    def _static_allowed(self, path):
        decoded = unquote(path).replace("\\", "/")
        parts = decoded.split("/")
        if any(p.startswith(".") or p == "__pycache__" or ":" in p for p in parts if p):
            self._json(403, {"error": "File is not accessible."})
            return False
        root = Path(self.directory).resolve()
        target = (root / decoded.lstrip("/")).resolve()
        if not target.is_relative_to(root):
            self._json(403, {"error": "File is not accessible."})
            return False
        if any(p.startswith(".") or p == "__pycache__" for p in target.relative_to(root).parts):
            self._json(403, {"error": "File is not accessible."})
            return False
        if private_selection_path(root, target):
            self._json(403, {"error": "File is not accessible."})
            return False
        return True

    def list_directory(self, _path):
        self._json(403, {"error": "Directory listings are disabled."})
        return None

    def _voices(self, query):
        params = parse_qs(query)
        try:
            page = int(params.get("page", ["1"])[0])
            if not 1 <= page <= 10000:
                raise ValueError()
            gender = params.get("gender", [""])[0]
            if gender and not re.fullmatch(r"[A-Za-z,-]{1,80}", gender):
                raise ValueError()
        except ValueError:
            self._json(400, {"error": "Invalid page or gender filter."})
            return
        key = self._key()
        if not key:
            return
        upstream = {"page": page, "page_size": 100, "pre_built_resemble_voice": "true", "sample_url": "true", "voice_selector": "true"}
        if gender:
            upstream["gender"] = gender
        try:
            result = provider_request("https://app.resemble.ai/api/v2/voices?" + urlencode(upstream), key)
            items = result.get("items", [])
            if not isinstance(items, list):
                raise ProviderError("Provider returned an invalid voice list.")
            voices = [v for item in items if (v := voice_metadata(item)) is not None]
            pages = result.get("num_pages", result.get("page_count", 1))
            pages = pages if isinstance(pages, int) and 1 <= pages <= 100000 else 1
            self._json(200, {"voices": voices, "page": page, "numPages": pages})
        except ProviderError as exc:
            self._json(502, {"error": str(exc)})

    def do_POST(self):
        if handle_owner_selection(self, shared_provider_ready):
            return
        if not self._guard(api=True):
            return
        if urlsplit(self.path).path == '/api/local/synthesize':
            self._local_synthesize()
            return
        if urlsplit(self.path).path != "/api/resemble/synthesize":
            self._json(404, {"error": "Unknown endpoint."})
            return
        if self.headers.get_content_type() != "application/json":
            self._json(415, {"error": "Content-Type must be application/json."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if self.headers.get("Transfer-Encoding") or not 0 < length <= MAX_BODY:
                raise ValueError()
        except ValueError:
            self._json(413, {"error": "A bounded Content-Length is required."})
            return
        try:
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError()
            uuid, text = body.get("voiceUuid"), body.get("text")
            if not isinstance(uuid, str) or not VOICE_ID.fullmatch(uuid):
                raise ValueError()
            if not isinstance(text, str) or not 1 <= len(text.strip()) <= 3000 or len(text) > 3000:
                raise ValueError()
        except (ValueError, UnicodeError):
            self._json(400, {"error": "Provide a valid voiceUuid and text of 1 to 3000 characters."})
            return
        key = self._key()
        if not key:
            return
        try:
            result = provider_request("https://f.cluster.resemble.ai/synthesize", key, {
                "voice_uuid": uuid, "data": text, "output_format": "wav", "precision": "PCM_16", "sample_rate": 48000,
            })
            content = result.get("audio_content")
            if not isinstance(content, str) or not content:
                raise ProviderError("Provider returned no audio.")
            try:
                audio = base64.b64decode(content, validate=True)
                if len(audio) < 12 or audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
                    raise ValueError()
            except ValueError:
                raise ProviderError("Provider returned invalid WAV audio.") from None
            self._json(200, {"audioContent": content, "format": "wav", "sampleRate": 48000})
        except ProviderError as exc:
            self._json(502, {"error": str(exc)})

    def _local_synthesize(self):
        if self.headers.get_content_type() != 'application/json':
            self._json(415, {'error':'JSON required'})
            return
        try:
            length = int(self.headers.get('Content-Length','0'))
            if not 0<length<=MAX_BODY or self.headers.get('Transfer-Encoding'):
                raise ValueError()
            body = json.loads(self.rfile.read(length))
            text, profile = body['text'], body['voicePackageId']
            if not isinstance(text,str) or not 1<=len(text.strip())<=1500 or len(text)>1500:
                raise ValueError()
            if profile not in ['agent-lee-voice-one']+['kokoro-'+v[0] for v in LOCAL_VOICES]:
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            self._json(400, {'error':'Choose a supported local voice and 1–1500 text characters.'})
            return
        try:
            if profile.startswith('kokoro-'):
                result = local_request(KOKORO_URL, '/synthesize', {'voiceId':profile[7:],'text':text}, timeout=180)
            elif CLONE and CLONE.container:
                result = CLONE.synthesize(text)
            else:
                started = time.monotonic()
                result = local_request(XTTS_URL, '/tts', {'text':text,'voice':'LEEWAY_VOICE::AGENT_LEE::DEFAULT_CLONE',
                    'language':'en','speed':1.0}, timeout=240)
                audio_name = str(result.get('audio_path','')).replace('\\','/').rsplit('/',1)[-1]
                if not re.fullmatch(r'[A-Za-z0-9_.-]+\.wav',audio_name):
                    raise ValueError()
                audio = local_request(XTTS_URL,'/audio/'+audio_name,binary=True)
                result = {'audioContent':base64.b64encode(audio).decode(),'format':'wav','sampleRate':24000,
                    'engine':'xtts-v2-existing-service','metrics':{'generationMs':(time.monotonic()-started)*1000}}
            self._json(200,result)
        except RuntimeError as exc:
            self._json(503,{'error':str(exc)})
        except Exception:
            self._json(503,{'error':'Local voice service unavailable or busy. Check local status and adapter logs.'})


def main():
    global CLONE
    CLONE = CloneWorker()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8877)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.directory.resolve()
    if not root.is_dir():
        parser.error("The static directory must exist.")
    from functools import partial
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(StudioHandler, directory=str(root)))
    print(f"LeeWay Voice Studio: http://127.0.0.1:{server.server_port}/studio.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        CLONE.close()


if __name__ == "__main__":
    main()
