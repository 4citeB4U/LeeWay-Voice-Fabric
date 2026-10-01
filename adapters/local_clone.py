"""Optional persistent XTTS worker adapter. Selected only by explicit deployment config."""
import json
import os
from pathlib import Path
import queue
import subprocess
import threading

class CloneWorker:
    def __init__(self):
        self.ready = False
        self.error = None
        self.lock = threading.Lock()
        self.responses = queue.Queue()
        self.process = None
        self.container = os.environ.get('LEEWAY_XTTS_CONTAINER', '')
        if self.container:
            threading.Thread(target=self.start, daemon=True).start()

    def start(self):
        try:
            source = Path(__file__).with_name('local-voice') / 'xtts-worker.py'
            # Source is sent through argv, not evaluated by a shell. No user text here.
            args = ['docker','exec','-i',self.container,'python','-u','-c',source.read_text(encoding='utf-8'),
                    '--reference',os.environ['LEEWAY_XTTS_REFERENCE'],
                    '--sha256',os.environ['LEEWAY_XTTS_REFERENCE_SHA256']]
            self.process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, text=True, encoding='utf-8', creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            for line in self.process.stdout:
                if not line.startswith('LEEWAY_JSON:'):
                    continue
                result = json.loads(line[len('LEEWAY_JSON:'):])
                if result.get('ready'):
                    self.ready = True
                else:
                    self.responses.put(result)
            self.ready = False
            self.error = 'Clone worker exited.'
        except Exception:
            self.ready = False
            self.error = 'Clone worker could not start. Check the configured runtime and reference.'

    def synthesize(self, text):
        if not self.ready:
            raise RuntimeError(self.error or 'Clone model is still warming up.')
        if not self.lock.acquire(blocking=False):
            raise RuntimeError('A clone audition is already running.')
        try:
            self.process.stdin.write(json.dumps({'text':text})+'\n')
            self.process.stdin.flush()
            result = self.responses.get(timeout=240)
            if result.get('error'):
                raise RuntimeError(result['error'])
            return result
        except queue.Empty:
            self.ready = False
            self.process.kill()
            raise RuntimeError('Clone synthesis timed out. Restart the studio to recover.') from None
        finally:
            self.lock.release()

    def close(self):
        if self.process and self.process.poll() is None:
            self.process.stdin.close()
