import importlib.util
import math
from pathlib import Path
import shutil
import struct
import tempfile
import unittest
import wave

spec = importlib.util.spec_from_file_location('master', Path(__file__).parents[1] / 'adapters/master-audition.py')
master = importlib.util.module_from_spec(spec)
spec.loader.exec_module(master)


@unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg is required')
class MasteringTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.source = self.root / 'source.wav'

    def tearDown(self):
        self.directory.cleanup()

    def source_audio(self, silent=False):
        with wave.open(str(self.source), 'wb') as output:
            output.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
            output.writeframes(b''.join(struct.pack('<h', 0 if silent else int(
                12000 * math.sin(2 * math.pi * 220 * i / 24000) *
                (0.6 + 0.4 * math.sin(2 * math.pi * 3 * i / 24000)))) for i in range(24000 * 5)))

    def test_cleanup_preserves_source_and_meets_peak_gate_at_requested_speed(self):
        self.source_audio()
        before = self.source.read_bytes()
        output = self.root / 'clean.wav'
        receipt = master.master(self.source, output, 'clean-strong', 1.15)
        self.assertEqual(receipt['loudnessAndPeakGate'], 'PASS')
        self.assertEqual(before, self.source.read_bytes())
        duration = float(master.run(['ffprobe', '-v', 'error', '-show_entries',
            'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(output)]).stdout)
        self.assertAlmostEqual(duration, 5 / 1.15, delta=0.08)
        with self.assertRaises(FileExistsError):
            master.master(self.source, output, 'clean')

    def test_silence_fails_instead_of_reporting_success(self):
        self.source_audio(silent=True)
        with self.assertRaises(ValueError):
            master.master(self.source, self.root / 'out.wav', 'clean')

    def test_invalid_speed_rejected(self):
        for speed in (0, 2, float('nan')):
            with self.assertRaises(ValueError):
                master.master(self.source, self.root / 'out.wav', 'clean', speed)


if __name__ == '__main__':
    unittest.main()
