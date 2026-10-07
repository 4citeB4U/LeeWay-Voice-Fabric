"""Real loopback cache-header checks; no synthesis, publication, or provider calls."""
from functools import partial
import http.client
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

PATH=Path(__file__).resolve().parents[1]/'adapters/studio-server.py'
spec=importlib.util.spec_from_file_location('studio_cache_fixture',PATH)
studio=importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)


class StudioCacheHeaders(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.root=Path(cls.temp.name)
        cls.fixtures={
            'index.html':b'current entry', 'studio.html':b'current studio',
            'src/studio.css':b'body{color:white}', 'src/studio.js':b'export const current=true;',
            'src/studio-console.js':b'export const consoleVersion=2;',
            'src/vendor/module.mjs':b'export const vendor=true;',
            'voices/preview.wav':b'RIFFfixtureWAVE', '.env':b'fixture private value',
        }
        for relative,data in cls.fixtures.items():
            path=cls.root/relative;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
        cls.server=studio.ThreadingHTTPServer(('127.0.0.1',0),partial(studio.StudioHandler,directory=str(cls.root)))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join();cls.temp.cleanup()

    def request(self,path,method='GET',headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        try:
            conn.request(method,path,headers=headers or {})
            response=conn.getresponse()
            return response.status,response.getheaders(),response.read()
        finally:conn.close()

    def assert_no_store(self,headers):
        self.assertEqual([v for k,v in headers if k.lower()=='cache-control'],['no-store'])

    def test_entry_pages_and_query_have_no_store(self):
        for url,expected in [('/',b'current entry'),('/index.html',b'current entry'),('/studio.html',b'current studio'),('/studio.html?revision=fixture',b'current studio')]:
            with self.subTest(url=url):
                status,headers,body=self.request(url)
                self.assertEqual(status,200);self.assertEqual(body,expected);self.assert_no_store(headers)

    def test_current_style_module_and_nested_vendor_are_not_cached(self):
        for path in ['src/studio.css','src/studio.js','src/studio-console.js','src/vendor/module.mjs']:
            with self.subTest(path=path):
                status,headers,body=self.request('/'+path)
                self.assertEqual(status,200);self.assertEqual(body,self.fixtures[path]);self.assert_no_store(headers)

    def test_head_keeps_length_and_no_store(self):
        status,headers,body=self.request('/src/studio.js',method='HEAD')
        self.assertEqual(status,200);self.assertEqual(body,b'');self.assert_no_store(headers)
        self.assertEqual(int(dict(headers)['Content-Length']),len(self.fixtures['src/studio.js']))

    def test_conditional_response_also_forbids_storage(self):
        _,headers,_=self.request('/studio.html')
        status,headers,body=self.request('/studio.html',headers={'If-Modified-Since':dict(headers)['Last-Modified']})
        self.assertEqual(status,304);self.assertEqual(body,b'');self.assert_no_store(headers)

    def test_published_replacement_returns_current_bytes(self):
        path=self.root/'src/studio-console.js'
        _,headers,_=self.request('/src/studio-console.js')
        old=path.read_bytes();modified=path.stat().st_mtime
        try:
            path.write_bytes(b'export const consoleVersion=3;');os.utime(path,(modified+4,modified+4))
            status,response_headers,body=self.request('/src/studio-console.js',headers={'If-Modified-Since':dict(headers)['Last-Modified']})
            self.assertEqual(status,200);self.assertEqual(body,b'export const consoleVersion=3;');self.assert_no_store(response_headers)
        finally:path.write_bytes(old);os.utime(path,(modified,modified))

    def test_existing_api_cache_contract_and_private_guards_remain(self):
        with patch.dict(os.environ,{'RESEMBLE_API_KEY':''}),patch.object(studio,'provider_request') as provider,patch.object(studio,'local_request') as local:
            status,headers,body=self.request('/api/provider/status')
            self.assertEqual(status,200);self.assertEqual(json.loads(body),{'resemble':{'configured':False}});self.assert_no_store(headers)
            status,headers,_=self.request('/.env');self.assertEqual(status,403);self.assert_no_store(headers)
            status,_,_=self.request('/studio.html',headers={'Host':'untrusted.example'});self.assertEqual(status,403)
            provider.assert_not_called();local.assert_not_called()

    def test_recorded_audio_retains_existing_cache_behavior(self):
        status,headers,body=self.request('/voices/preview.wav')
        self.assertEqual(status,200);self.assertEqual(body,self.fixtures['voices/preview.wav'])
        self.assertFalse(any(k.lower()=='cache-control' for k,_ in headers))


if __name__=='__main__':unittest.main()
