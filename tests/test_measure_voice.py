"""Known integer signals test units and mapping, not perceptual quality."""
import array
import hashlib
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
import wave

PATH = Path(__file__).resolve().parents[1] / "adapters" / "measure-voice.py"
spec = importlib.util.spec_from_file_location("measure_voice", PATH)
measure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(measure)


class MeasurementTests(unittest.TestCase):
    def test_silence(self):
        self.assertEqual(measure.measure_window([0] * 20), [0, 0, 0, 0, 0, 0])

    def test_constant_half_scale(self):
        self.assertEqual(measure.measure_window([16384] * 20), [0.5, 0.5, 0.5, 0, 0, 0])
        self.assertEqual(measure.measure_window([-16384] * 20), [0.5, 0.5, 0.5, 0, 0, 0])

    def test_alternating_half_scale(self):
        self.assertEqual(measure.measure_window([-16384, 16384] * 10), [0.5, 0.5, 0, 1, 0, 0])

    def test_rails_and_zero_convention(self):
        row = measure.measure_window([-32768, 0, 32767, 0])
        self.assertEqual(row[1], 1)
        self.assertEqual(row[2], 1 / (32768 * 4))
        self.assertEqual(row[3], 1 / 3)
        self.assertEqual(row[4], 0.5)
        self.assertEqual(row[5], 0)
        self.assertEqual(measure.measure_window([1])[3], 0)

    def test_invalid_samples(self):
        for values in ([], [float("nan")], [32768], [-32769]):
            with self.assertRaises(ValueError):
                measure.measure_window(values)

    def write_wav(self, path, samples, rate=24000):
        data = array.array("h", samples)
        if sys.byteorder != "little":
            data.byteswap()
        with wave.open(str(path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes(data.tobytes())

    def test_file_hash_units_partition_and_formula_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "known.wav"
            self.write_wav(path, [16384] * 161)
            result = measure.measure_wav(path, "known.wav")
            self.assertEqual(result["audioSha256"], hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertEqual(result["durationSeconds"], 161 / 24000)
            self.assertEqual(result["windowFrameBoundaries"], [i * 161 // 16 for i in range(17)])
            request = result["request"]
            self.assertEqual(request["adapterId"], "runtime-state-v1")
            self.assertEqual(request["input"]["stateRows"], [[0.5, 0.5, 0.5, 0, 0, 0]] * 16)
            self.assertEqual(request["input"]["ranges"], [[0, 1]] * 6)

    def test_bad_format_and_short_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.wav"
            self.write_wav(path, [0] * 100, rate=16000)
            with self.assertRaises(ValueError):
                measure.measure_wav(path)
            self.write_wav(path, [0] * 15)
            with self.assertRaises(ValueError):
                measure.measure_wav(path)


if __name__ == "__main__":
    unittest.main()
