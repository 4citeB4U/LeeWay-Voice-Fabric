"""REGION: LEEWAY.VOICE.TEST; TAG: OWNER_PUBLICATION_HTTP_AND_STORAGE_BEHAVIOR
5WH: WHO=Voice Fabric maintainers; WHAT=Exercise existing-binding publication;
WHY=Keep auditions separate from shared state; WHERE=temporary local fixtures;
WHEN=CI; HOW=real loopback HTTP and atomic files with provider readiness mocked.
AUTHORIZED ROLES: TEST_FIXTURES_ONLY. LICENSE: MIT. No device or model execution.
"""
from concurrent.futures import ThreadPoolExecutor
from functools import partial
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('studio_owner_test', ROOT / 'adapters/studio-server.py')
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)
import voice_selection_owner as owner


def fixture(root):
    root = Path(root)
    (root / 'runtime').mkdir(exist_ok=True)
    (root / 'voices').mkdir(exist_ok=True)
    binding = {
        'authority': 'LEEWAY_VOICE_FABRIC',
        'bindings': {
            'agent-lee': {'agentId': 'agent-lee', 'voicePackageId': 'kokoro-am_michael',
                          'personaFamily': 'fixture-persona', 'personaArchetypeId': 'fixture-archetype',
                          'selectedBy': 'FIXTURE_ONLY'},
            'fixture-worker': {'agentId': 'fixture-worker', 'voicePackageId': 'do-not-change'},
        },
    }
    catalog = {'authority': '4citeB4U/LeeWay-Voice-Fabric', 'packages': [
        {'id': 'kokoro-am_michael', 'voiceId': 'am_michael', 'provider': 'kokoro', 'status': 'AVAILABLE'},
        {'id': 'kokoro-af_heart', 'voiceId': 'af_heart', 'provider': 'kokoro', 'status': 'AVAILABLE'},
        {'id': 'agent-lee-voice-one', 'provider': 'chatterbox', 'status': 'AVAILABLE'},
        {'id': 'chatterbox-default', 'provider': 'chatterbox', 'status': 'AVAILABLE'},
        {'id': 'resemble-fixture', 'provider': 'resemble', 'status': 'AVAILABLE'},
    ]}
    file = root / 'runtime/employee-voice-bindings.v1.json'
    file.write_text(json.dumps(binding, indent=2), encoding='utf-8')
    (root / 'voices/catalog.v1.json').write_text(json.dumps(catalog), encoding='utf-8')
    (root / 'studio.html').write_text('public studio fixture', encoding='utf-8')
    return file


class OwnerPublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.file = fixture(self.root)
        self.before = self.file.read_bytes()
        self.env = patch.dict(os.environ, {'LEEWAY_VOICE_RUNTIME_ROOT': '', 'LEEWAY_ALLOWED_ORIGINS': ''})
        self.env.start()
        owner._sessions.clear()
        self.server = studio.ThreadingHTTPServer(('127.0.0.1', 0), partial(studio.StudioHandler, directory=self.temp.name))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_port
        self.origin = f'http://127.0.0.1:{self.port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.env.stop()
        self.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        raw = json.dumps(body) if body is not None else None
        supplied = {'Content-Type': 'application/json'} if body is not None else {}
        supplied.update(headers or {})
        connection.request(method, path, raw, supplied)
        response = connection.getresponse()
        result = response.read()
        try:
            result = json.loads(result)
        except ValueError:
            pass
        code, response_headers = response.status, dict(response.getheaders())
        connection.close()
        return code, result, response_headers

    def session(self, cookie=None):
        headers = {'Cookie': cookie} if cookie else {}
        status, state, response_headers = self.request('GET', '/api/agent-lee/selection/session', headers=headers)
        self.assertEqual(status, 200, state)
        request_headers = {'Origin': self.origin, 'Cookie': response_headers['Set-Cookie'].split(';', 1)[0],
                           'X-LeeWay-Owner-CSRF': state['csrf']}
        return state, request_headers

    def payload(self, state, **changes):
        return {'expectedRevision': state['recordRevision'], 'voicePackageId': 'kokoro-af_heart',
                'tuning': {'pace': 1.15, 'bass': 2, 'gain': -1}, 'approve': True, **changes}

    def publish(self, state, headers, **changes):
        with patch.object(studio, 'shared_provider_ready', return_value=True):
            return self.request('POST', '/api/agent-lee/selection', self.payload(state, **changes), headers)

    def test_session_is_read_only_and_reuses_cookie_for_multiple_tabs(self):
        state, headers = self.session()
        second, second_headers = self.session(headers['Cookie'])
        self.assertEqual(state['recordRevision'], hashlib.sha256(self.before).hexdigest())
        self.assertEqual(state['csrf'], second['csrf'])
        self.assertEqual(headers['Cookie'], second_headers['Cookie'])
        self.assertEqual(len(owner._sessions), 1)
        self.assertEqual(state['sharedVoicePackageIds'], ['kokoro-am_michael', 'kokoro-af_heart', 'agent-lee-voice-one'])
        self.assertEqual(state['capabilities'], {'acousticTuning': True, 'synthesisTuning': False, 'monitorMix': False})
        self.assertEqual(state['tuningProcessor'], 'LEEWAY_STUDIO_DSP_V1')
        self.assertEqual(state['renderingState'], 'RUNTIME_TUNING_CONSUMER_NOT_VERIFIED')
        self.assertEqual(self.file.read_bytes(), self.before)
        self.assertFalse((self.root / 'receipts').exists())

    def test_dry_run_checks_candidate_without_mutating_or_receipting(self):
        state, headers = self.session()
        code, result, _ = self.publish(state, headers, dryRun=True, approve=False)
        self.assertEqual(code, 200, result)
        self.assertEqual(result['state'], 'VALIDATED_NOT_PUBLISHED')
        self.assertEqual(result['candidate']['voicePackageId'], 'kokoro-af_heart')
        self.assertEqual(result['candidate']['tuning']['pace'], 1.15)
        self.assertEqual(result['binding']['voicePackageId'], 'kokoro-am_michael')
        self.assertEqual(self.file.read_bytes(), self.before)
        self.assertFalse((self.root / 'receipts').exists())

    def test_apply_changes_only_agent_voice_and_tuning_and_preserves_exact_backup(self):
        state, headers = self.session()
        code, result, _ = self.publish(state, headers)
        self.assertEqual(code, 200, result)
        self.assertEqual(result['state'], 'PUBLISHED_NOT_DEVICE_ACKNOWLEDGED')
        self.assertNotEqual(result['recordRevision'], state['recordRevision'])
        after = self.file.read_bytes()
        self.assertEqual(result['recordRevision'], hashlib.sha256(after).hexdigest())
        doc, original = json.loads(after), json.loads(self.before)
        self.assertEqual(doc['authority'], original['authority'])
        self.assertEqual(doc['bindings']['fixture-worker'], original['bindings']['fixture-worker'])
        agent = doc['bindings']['agent-lee']
        self.assertEqual(agent['voicePackageId'], 'kokoro-af_heart')
        self.assertEqual(agent['personaFamily'], 'fixture-persona')
        self.assertEqual(agent['personaArchetypeId'], 'fixture-archetype')
        self.assertEqual(agent['tuning']['pace'], 1.15)
        self.assertEqual(agent['publicationVersion'], 1)
        run = self.root / 'receipts/selection-publications' / result['publicationReceipt']
        self.assertEqual((run / 'binding.before.json').read_bytes(), self.before)
        receipt_bytes = (run / 'publication-receipt.json').read_bytes()
        self.assertEqual(hashlib.sha256(receipt_bytes).hexdigest(), result['receiptSha256'])
        receipt = json.loads(receipt_bytes)
        self.assertEqual(receipt['beforeRevision'], state['recordRevision'])
        self.assertEqual(receipt['afterRevision'], result['recordRevision'])
        self.assertEqual(receipt['formulaExecution'], 'NOT_EXECUTED')
        self.assertEqual(receipt['learningLedger'], 'NOT_UPDATED')
        refreshed, _ = self.session(headers['Cookie'])
        self.assertEqual(refreshed['recordRevision'], result['recordRevision'])
        self.assertEqual(refreshed['binding']['voicePackageId'], 'kokoro-af_heart')

    def test_missing_existing_binding_never_bootstraps_a_record(self):
        self.file.unlink()
        code, body, _ = self.request('GET', '/api/agent-lee/selection/session')
        self.assertEqual(code, 503)
        self.assertEqual(body['error'], 'VOICE_EXISTING_AUTHORITY_RECORD_REQUIRED')
        self.assertFalse(self.file.exists())
        self.assertFalse(owner._sessions)
        self.assertFalse((self.root / 'receipts').exists())
        self.assertEqual(self.request('GET', '/studio.html')[0], 200)

    def test_explicit_runtime_root_reuses_only_that_existing_binding(self):
        with tempfile.TemporaryDirectory() as other:
            other_file = fixture(other)
            with patch.dict(os.environ, {'LEEWAY_VOICE_RUNTIME_ROOT': other}):
                state, headers = self.session()
                self.assertEqual(self.publish(state, headers)[0], 200)
            self.assertEqual(self.file.read_bytes(), self.before)
            self.assertEqual(json.loads(other_file.read_bytes())['bindings']['agent-lee']['voicePackageId'], 'kokoro-af_heart')

    def test_invalid_authority_and_missing_agent_are_rejected(self):
        for doc in ({'authority': 'OTHER', 'bindings': {}}, {'authority': 'LEEWAY_VOICE_FABRIC', 'bindings': {}}):
            self.file.write_text(json.dumps(doc), encoding='utf-8')
            code, _, _ = self.request('GET', '/api/agent-lee/selection/session')
            self.assertEqual(code, 400)
        fixture(self.root)
        (self.root / 'voices/catalog.v1.json').write_text('{"authority":"OTHER","packages":[]}', encoding='utf-8')
        self.assertEqual(self.request('GET', '/api/agent-lee/selection/session')[0], 400)

    def test_no_approval_unsupported_profiles_and_invalid_tuning_leave_binding_intact(self):
        state, headers = self.session()
        for changes in ({'approve': False}, {'voicePackageId': 'imported-local'}, {'voicePackageId': 'chatterbox-default'},
                        {'voicePackageId': 'resemble-fixture'}, {'tuning': {'pitch': 7}}, {'tuning': {'gain': float('nan')}},
                        {'tuning': {'pace': True}}, {'tuning': {'temperature': .5}}, {'tuning': []}):
            code, _, _ = self.publish(state, headers, **changes)
            self.assertEqual(code, 400, changes)
            self.assertEqual(self.file.read_bytes(), self.before)
        self.assertFalse((self.root / 'receipts').exists())

    def test_offline_provider_blocks_apply_without_synthesis(self):
        state, headers = self.session()
        with patch.object(studio, 'shared_provider_ready', return_value=False), patch.object(studio, 'local_request') as request:
            code, body, _ = self.request('POST', '/api/agent-lee/selection', self.payload(state), headers)
            self.assertEqual(code, 503)
            self.assertEqual(body['error'], 'SELECTED_VOICE_PROVIDER_NOT_READY')
            request.assert_not_called()
        self.assertEqual(self.file.read_bytes(), self.before)

    def test_stale_revision_is_409_and_does_not_overwrite_another_tab(self):
        state, headers = self.session()
        self.assertEqual(self.publish(state, headers)[0], 200)
        actual = self.file.read_bytes()
        code, body, _ = self.publish(state, headers)
        self.assertEqual(code, 409)
        self.assertEqual(body['error'], 'VOICE_SELECTION_CONFLICT_RELOAD')
        self.assertEqual(self.file.read_bytes(), actual)

    def test_cookie_csrf_origin_and_cross_site_guards_precede_write(self):
        state, headers = self.session()
        for changed in ({'Cookie': ''}, {'X-LeeWay-Owner-CSRF': 'invalid'}, {'Origin': ''},
                        {'Origin': 'https://other.example'}, {'Host': 'other.example'}, {'Sec-Fetch-Site': 'cross-site'}):
            code, _, _ = self.publish(state, {**headers, **changed})
            self.assertEqual(code, 403, changed)
            self.assertEqual(self.file.read_bytes(), self.before)
        with patch.dict(os.environ, {'LEEWAY_ALLOWED_ORIGINS': 'https://other.example'}):
            self.assertEqual(self.publish(state, {**headers, 'Origin': 'https://other.example'})[0], 403)

    def test_expired_session_cannot_publish_and_refresh_gets_new_token(self):
        state, headers = self.session()
        for session in owner._sessions.values():
            session['expires'] = 0
        self.assertEqual(self.publish(state, headers)[0], 403)
        new, new_headers = self.session(headers['Cookie'])
        self.assertNotEqual(new['csrf'], state['csrf'])
        self.assertEqual(self.publish(new, new_headers)[0], 200)

    def test_request_body_and_extra_runtime_settings_are_bounded(self):
        state, headers = self.session()
        for body in ([], {'ignored': 'x' * 9000}, self.payload(state, temperature=.8)):
            self.assertEqual(self.request('POST', '/api/agent-lee/selection', body, headers)[0], 400)
        for changed in ({'Content-Type': 'text/plain'}, {'Transfer-Encoding': 'chunked'}):
            self.assertEqual(self.publish(state, {**headers, **changed})[0], 400)
        self.assertEqual(self.file.read_bytes(), self.before)

    def test_private_binding_lock_and_receipt_backups_are_not_static_assets(self):
        state, headers = self.session()
        _, result, _ = self.publish(state, headers)
        backup = '/receipts/selection-publications/' + result['publicationReceipt'] + '/binding.before.json'
        for path in ('/runtime/employee-voice-bindings.v1.json', '/runtime/employee-voice-bindings.v1.publish.lock', backup):
            self.assertEqual(self.request('GET', path)[0], 403, path)
            self.assertEqual(self.request('HEAD', path)[0], 403, path)
        self.assertEqual(self.request('GET', '/studio.html')[0], 200)
        self.assertEqual(self.request('GET', '/voices/catalog.v1.json')[0], 200)

    def test_configured_root_cannot_escape_through_a_binding_symlink(self):
        with tempfile.TemporaryDirectory() as elsewhere:
            outside = fixture(elsewhere)
            self.file.unlink()
            try:
                self.file.symlink_to(outside)
            except OSError:
                self.skipTest('Symlink creation is unavailable on this platform')
            code, body, _ = self.request('GET', '/api/agent-lee/selection/session')
            self.assertEqual(code, 503)
            self.assertEqual(body['error'], 'VOICE_AUTHORITY_PATH_OUTSIDE_CONFIGURED_ROOT')
            self.assertEqual(outside.read_bytes(), self.before)
            self.assertEqual(self.request('GET', '/studio.html')[0], 200)

    def test_concurrent_apply_allows_one_writer_and_rejects_the_other(self):
        barrier = threading.Barrier(2)
        request = self.payload({'recordRevision': hashlib.sha256(self.before).hexdigest()})
        def apply():
            try:
                return owner.SelectionStore(self.root).publish(request, lambda _profile: (barrier.wait(timeout=5), True)[1])['state']
            except owner.PublicationError as error:
                return error.status
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: apply(), range(2)))
        self.assertCountEqual(results, ['PUBLISHED_NOT_DEVICE_ACKNOWLEDGED', 409])
        self.assertEqual(json.loads(self.file.read_bytes())['bindings']['agent-lee']['publicationVersion'], 1)

    def test_receipt_write_failure_reports_changed_state_and_recovery_reference(self):
        state, headers = self.session()
        original = Path.write_text
        def fail_receipt(path, *args, **kwargs):
            if path.name == 'publication-receipt.json':
                raise OSError('fixture receipt filesystem failure')
            return original(path, *args, **kwargs)
        with patch.object(Path, 'write_text', fail_receipt):
            code, body, _ = self.publish(state, headers)
        self.assertEqual(code, 503)
        self.assertTrue(body['publicationMayHaveChanged'])
        self.assertEqual(body['state'], 'PUBLICATION_OUTCOME_REQUIRES_REFRESH')
        self.assertNotEqual(self.file.read_bytes(), self.before)
        backup = self.root / 'receipts/selection-publications' / body['publicationReceipt'] / 'binding.before.json'
        self.assertEqual(backup.read_bytes(), self.before)
        new, _ = self.session(headers['Cookie'])
        self.assertEqual(new['binding']['voicePackageId'], 'kokoro-af_heart')

    def test_provider_readiness_is_specific_to_selected_catalog_voice(self):
        with patch.object(studio, 'local_request', return_value={'ready': True, 'voices': ['am_michael']}):
            self.assertTrue(studio.shared_provider_ready({'provider': 'kokoro', 'voiceId': 'am_michael'}))
            self.assertFalse(studio.shared_provider_ready({'provider': 'kokoro', 'voiceId': 'af_heart'}))
        with patch.object(studio, 'local_status', return_value={'xtts': {'ready': False}}):
            self.assertFalse(studio.shared_provider_ready({'provider': 'chatterbox', 'id': 'agent-lee-voice-one'}))
        with patch.object(studio, 'local_status', return_value={'xtts': {'ready': True}}):
            self.assertTrue(studio.shared_provider_ready({'provider': 'chatterbox', 'id': 'agent-lee-voice-one'}))
            self.assertFalse(studio.shared_provider_ready({'provider': 'chatterbox', 'id': 'chatterbox-default'}))


if __name__ == '__main__':
    unittest.main()
