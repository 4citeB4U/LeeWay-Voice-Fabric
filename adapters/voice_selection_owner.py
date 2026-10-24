"""REGION: LEEWAY.VOICE.STUDIO; TAG: EXPLICIT_OWNER_PUBLICATION_TO_EXISTING_BINDING
5WH: WHO=Creator using owner-local Studio; WHAT=Publish a catalog speaker and bounded tuning;
WHY=Preview storage must not impersonate shared selection; WHERE=existing Voice Fabric record;
WHEN=explicit Apply; HOW=local-origin session/CSRF, compare-and-swap, atomic replace, read-back.
AUTHORIZED ROLES: OWNER_LOCAL_STUDIO. LICENSE: MIT.

Reuses the existing owner publisher inspected on the live Voice Fabric runtime.
Remote callers require their existing authenticated device transport. Publication
is not device delivery, runtime DSP execution, or acoustic playback verification.
"""
import copy
import hashlib
import hmac
import json
import math
import os
import secrets
import tempfile
import threading
import time
from datetime import datetime, timezone
from http.cookies import CookieError, SimpleCookie
from pathlib import Path


RANGES = {
    'pace': (.6, 1.6, 1), 'pitch': (-6, 6, 0), 'bass': (-9, 9, 0),
    'warmth': (-9, 9, 0), 'presence': (-9, 9, 0), 'air': (-9, 9, 0),
    'highpass': (40, 180, 40), 'deEss': (0, 1, 0), 'noiseReduction': (0, 1, 0),
    'compression': (1, 4, 1), 'gain': (-9, 6, 0),
}
TUNING_PROCESSOR = 'LEEWAY_STUDIO_DSP_V1'
MAX_RECORD_BYTES = 1024 * 1024
SESSION_SECONDS = 600
COOKIE_NAME = 'leeway_voice_owner'
ROUTES = ('/api/agent-lee/selection', '/api/agent-lee/selection/session')


class PublicationError(ValueError):
    def __init__(self, message, status=400, **details):
        super().__init__(message)
        self.status, self.details = status, details


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def tuning(value):
    if not isinstance(value, dict) or set(value) - set(RANGES):
        raise ValueError('VOICE_TUNING_FIELDS_INVALID')
    out = {}
    for key, (lo, hi, default) in RANGES.items():
        number = value.get(key, default)
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not lo <= number <= hi:
            raise ValueError('VOICE_TUNING_RANGE_' + key)
        out[key] = number
    return out


def shared_profile_supported(profile):
    return isinstance(profile, dict) and profile.get('status') == 'AVAILABLE' and (
        profile.get('provider') == 'kokoro' or
        (profile.get('provider') == 'chatterbox' and profile.get('id') == 'agent-lee-voice-one')
    )


def read_bounded(path):
    try:
        with path.open('rb') as stream:
            raw = stream.read(MAX_RECORD_BYTES + 1)
    except FileNotFoundError:
        raise PublicationError('VOICE_EXISTING_AUTHORITY_RECORD_REQUIRED', 503) from None
    if len(raw) > MAX_RECORD_BYTES:
        raise ValueError('VOICE_AUTHORITY_RECORD_SIZE_LIMIT')
    return raw


class SelectionStore:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.file = self._inside('runtime/employee-voice-bindings.v1.json')
        self.catalog = self._inside('voices/catalog.v1.json')
        self.receipts = self._inside('receipts/selection-publications')

    def _inside(self, relative):
        result = (self.root / relative).resolve()
        if not result.is_relative_to(self.root):
            raise PublicationError('VOICE_AUTHORITY_PATH_OUTSIDE_CONFIGURED_ROOT', 503)
        return result

    def read_catalog(self):
        catalog = json.loads(read_bounded(self.catalog).decode('utf-8-sig'))
        if not isinstance(catalog, dict) or catalog.get('authority') != '4citeB4U/LeeWay-Voice-Fabric' or not isinstance(catalog.get('packages'), list):
            raise ValueError('VOICE_CATALOG_AUTHORITY_MISMATCH')
        return catalog

    def read(self):
        raw = read_bounded(self.file)
        doc = json.loads(raw.decode('utf-8-sig'))
        if not isinstance(doc, dict) or doc.get('authority') != 'LEEWAY_VOICE_FABRIC':
            raise ValueError('VOICE_AUTHORITY_MISMATCH')
        records = doc.get('bindings')
        record = records.get('agent-lee') if isinstance(records, dict) else None
        if not isinstance(record, dict) or record.get('agentId') != 'agent-lee':
            raise ValueError('VOICE_AGENT_BINDING_REQUIRED')
        catalog = self.read_catalog()
        state = {
            'authority': 'LEEWAY_VOICE_FABRIC', 'recordRevision': digest(raw),
            'binding': record, 'tuning': tuning(record.get('tuning', {})),
            'tuningProcessor': TUNING_PROCESSOR,
            'sharedVoicePackageIds': [p['id'] for p in catalog['packages'] if shared_profile_supported(p) and isinstance(p.get('id'), str)],
            'capabilities': {'acousticTuning': True, 'synthesisTuning': False, 'monitorMix': False},
            'deliveryState': 'DEVICE_ACKNOWLEDGEMENTS_NOT_YET_RECORDED',
            'renderingState': 'RUNTIME_TUNING_CONSUMER_NOT_VERIFIED',
        }
        return state, raw, doc

    def publish(self, request, provider_ready):
        if not isinstance(request, dict) or set(request) - {'expectedRevision', 'voicePackageId', 'tuning', 'approve', 'dryRun'}:
            raise ValueError('VOICE_PUBLICATION_REQUEST_INVALID')
        state, raw, doc = self.read()
        if request.get('expectedRevision') != state['recordRevision']:
            raise PublicationError('VOICE_SELECTION_CONFLICT_RELOAD', 409)
        matches = [p for p in self.read_catalog()['packages'] if isinstance(p, dict) and p.get('id') == request.get('voicePackageId')]
        if len(matches) != 1 or not shared_profile_supported(matches[0]):
            raise ValueError('VOICE_PROFILE_NOT_ADMITTED_TO_SHARED_CATALOG')
        profile, settings = matches[0], tuning(request.get('tuning', {}))
        if not provider_ready(profile):
            raise PublicationError('SELECTED_VOICE_PROVIDER_NOT_READY', 503)
        if request.get('dryRun') is True:
            return {**state, 'state': 'VALIDATED_NOT_PUBLISHED', 'candidate': {'voicePackageId': profile['id'], 'tuning': settings}}
        if request.get('approve') is not True:
            raise ValueError('EXPLICIT_CREATOR_APPLY_REQUIRED')
        lock, fd, temp, replaced, run = self.file.with_suffix('.publish.lock'), None, None, False, None
        try:
            # This is the existing publisher's exclusive lock, not a new registry.
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            if read_bounded(self.file) != raw:
                raise PublicationError('VOICE_SELECTION_CONFLICT_RELOAD', 409)
            updated = copy.deepcopy(doc)
            record = updated['bindings']['agent-lee']
            record.update(voicePackageId=profile['id'], tuning=settings, tuningProcessor=TUNING_PROCESSOR,
                          state='VERIFIED_CATALOG_SELECTION', selectedBy='CREATOR',
                          selectionUpdatedAt=datetime.now(timezone.utc).isoformat())
            record['publicationVersion'] = int(record.get('publicationVersion', 0)) + 1
            new = (json.dumps(updated, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
            if len(new) > MAX_RECORD_BYTES:
                raise ValueError('VOICE_AUTHORITY_RECORD_SIZE_LIMIT')
            run = self.receipts / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '-' + secrets.token_hex(4))
            run.mkdir(parents=True, exist_ok=False)
            (run / 'binding.before.json').write_bytes(raw)
            handle, name = tempfile.mkstemp(prefix='.voice-selection-', suffix='.tmp', dir=self.file.parent)
            temp = Path(name)
            with os.fdopen(handle, 'wb') as stream:
                stream.write(new)
                stream.flush()
                os.fsync(stream.fileno())
            if read_bounded(self.file) != raw:
                raise PublicationError('VOICE_SELECTION_CONFLICT_RELOAD', 409)
            os.replace(temp, self.file)
            replaced, temp = True, None
            after, actual, _ = self.read()
            if actual != new:
                raise PublicationError('VOICE_PUBLICATION_READBACK_FAILED', 503)
            receipt = {
                'schemaVersion': 'leeway.voice-selection-publication.v1', 'state': 'PUBLISHED_NOT_DEVICE_ACKNOWLEDGED',
                'beforeRevision': digest(raw), 'afterRevision': digest(new), 'voicePackageId': profile['id'],
                'tuning': settings, 'at': datetime.now(timezone.utc).isoformat(), 'actor': 'CREATOR_LOCAL_STUDIO_APPLY',
                'formulaExecution': 'NOT_EXECUTED', 'speakerAudibility': 'NOT_MEASURED', 'learningLedger': 'NOT_UPDATED',
            }
            receipt_path = run / 'publication-receipt.json'
            receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
            return {**after, 'state': receipt['state'], 'publicationReceipt': run.name, 'receiptSha256': digest(receipt_path.read_bytes())}
        except FileExistsError:
            raise PublicationError('VOICE_PUBLICATION_BUSY', 409) from None
        except Exception:
            if replaced:
                raise PublicationError('VOICE_PUBLICATION_OUTCOME_REQUIRES_REFRESH', 503,
                                       publicationMayHaveChanged=True,
                                       publicationReceipt=run.name if run else None,
                                       state='PUBLICATION_OUTCOME_REQUIRES_REFRESH') from None
            raise
        finally:
            if temp is not None:
                temp.unlink(missing_ok=True)
            if fd is not None:
                os.close(fd)
                lock.unlink(missing_ok=True)


def configured_store(directory):
    # An operator may explicitly point at the already-owned runtime root. No scan,
    # downloaded state, or guessed candidate creates or selects another authority.
    return SelectionStore(os.environ.get('LEEWAY_VOICE_RUNTIME_ROOT') or directory)


def private_selection_path(directory, target):
    relative = target.relative_to(Path(directory).resolve()).as_posix().lower()
    if relative.startswith('runtime/employee-voice-bindings.v1.') or relative.startswith('receipts/selection-publications/'):
        return True
    try:
        configured_root = Path(os.environ.get('LEEWAY_VOICE_RUNTIME_ROOT') or directory).resolve()
        binding = (configured_root / 'runtime/employee-voice-bindings.v1.json').resolve()
        receipts = (configured_root / 'receipts/selection-publications').resolve()
        return target == binding or target.is_relative_to(receipts)
    except (OSError, ValueError):
        # A broken publication configuration must not disable unrelated Studio
        # assets. Known private paths above stay denied; publication fails closed.
        return False


_sessions = {}
_guard = threading.Lock()


def _cookie_session(handler):
    cookie = SimpleCookie()
    try:
        cookie.load(handler.headers.get('Cookie', ''))
    except CookieError:
        return None
    item = cookie.get(COOKIE_NAME)
    return item.value if item else None


def handle_owner_selection(handler, provider_ready):
    path = handler.path.split('?', 1)[0]
    if path not in ROUTES:
        return False
    if not handler._guard(api=True):
        return True
    host = handler.headers.get('Host', '')
    origin, peer = 'http://' + host, handler.client_address[0]
    if peer not in ('127.0.0.1', '::1') or handler.headers.get('Sec-Fetch-Site') not in (None, 'same-origin', 'none') or handler.headers.get('Origin') not in (None, origin):
        handler._json(403, {'error': 'OWNER_LOCAL_STUDIO_REQUIRED'})
        return True
    try:
        store = configured_store(handler.directory)
        if handler.command == 'GET' and path.endswith('/session'):
            state, _, _ = store.read()
            with _guard:
                now = time.monotonic()
                for key in list(_sessions):
                    if _sessions[key]['expires'] <= now:
                        del _sessions[key]
                sid = _cookie_session(handler)
                session = _sessions.get(sid)
                if not session or session['host'] != host or session['root'] != str(store.root):
                    if len(_sessions) >= 32:
                        raise PublicationError('OWNER_SESSION_LIMIT', 503)
                    sid = secrets.token_urlsafe(32)
                    session = {'csrf': secrets.token_urlsafe(32), 'expires': now + SESSION_SECONDS,
                               'host': host, 'root': str(store.root)}
                    _sessions[sid] = session
                lifetime = max(1, math.ceil(session['expires'] - now))
            body = json.dumps({**state, 'csrf': session['csrf'], 'scope': 'LOCAL_OWNER_STUDIO_PUBLICATION_ONLY'}).encode()
            handler.send_response(200)
            handler.send_header('Content-Type', 'application/json')
            handler.send_header('Cache-Control', 'no-store')
            handler.send_header('X-Content-Type-Options', 'nosniff')
            handler.send_header('Set-Cookie', f'{COOKIE_NAME}={sid}; Path=/api/agent-lee/; HttpOnly; SameSite=Strict; Max-Age={lifetime}')
            handler.send_header('Content-Length', str(len(body)))
            handler.end_headers()
            handler.wfile.write(body)
            return True
        if handler.command != 'POST' or path != ROUTES[0]:
            handler._json(405, {'error': 'METHOD_NOT_ALLOWED'})
            return True
        if handler.headers.get('Origin') != origin:
            handler._json(403, {'error': 'OWNER_STUDIO_ORIGIN_REQUIRED'})
            return True
        with _guard:
            session = _sessions.get(_cookie_session(handler))
            supplied = handler.headers.get('X-LeeWay-Owner-CSRF', '')
            if not session or session['host'] != host or session['root'] != str(store.root) or session['expires'] <= time.monotonic() or not hmac.compare_digest(session['csrf'], supplied):
                handler._json(403, {'error': 'OWNER_STUDIO_SESSION_REQUIRED'})
                return True
        if handler.headers.get_content_type() != 'application/json' or handler.headers.get('Transfer-Encoding'):
            raise ValueError('BOUNDED_JSON_REQUIRED')
        length = int(handler.headers.get('Content-Length', '0'))
        if not 0 < length <= 8192:
            raise ValueError('VOICE_REQUEST_SIZE_LIMIT')
        request = json.loads(handler.rfile.read(length))
        handler._json(200, store.publish(request, provider_ready))
    except PublicationError as error:
        handler._json(error.status, {'error': str(error), **error.details})
    except (ValueError, KeyError, TypeError) as error:
        message = str(error)
        handler._json(400, {'error': message if message.replace('_', '').isalnum() else 'VOICE_PUBLICATION_INVALID'})
    except Exception:
        handler._json(503, {'error': 'VOICE_PUBLICATION_UNAVAILABLE_NO_SYNC_CLAIM'})
    return True
