#!/usr/bin/env python3
"""Launch local Voice Studio using repository-relative paths and inherited config."""
import argparse
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time


def stop(children):
    for child in reversed(children):
        if child.poll() is None:
            child.terminate()
    for child in reversed(children):
        try:
            child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)


def free_port(port):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", port))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8877, help="Studio HTTP port (default 8877)")
    parser.add_argument("--voice-port", type=int, default=int(os.environ.get("LEEWAY_KOKORO_PORT", "8878")), help="Local Kokoro HTTP port (default 8878)")
    parser.add_argument("--setup", action="store_true", help="Run npm ci and the pinned model downloader before startup")
    parser.add_argument("--check", action="store_true", help="Check required files/runtimes/ports, without starting services")
    args = parser.parse_args()
    if not all(1 <= p <= 65535 for p in (args.port, args.voice_port)) or args.port == args.voice_port:
        parser.error("Choose two distinct ports between 1 and 65535.")
    root = Path(__file__).resolve().parents[1]
    adapter = root / "adapters" / "local-voice"
    node = shutil.which("node")
    if not node:
        parser.error("Node.js must be installed and available on PATH.")
    required = [adapter / "server.mjs", adapter / "package-lock.json", adapter / "download-model.py", root / "adapters" / "studio-server.py"]
    for file in required:
        if not file.is_file():
            parser.error(f"Required repository file missing: {file.relative_to(root)}")
    try:
        free_port(args.port)
        free_port(args.voice_port)
    except OSError:
        parser.error("A requested local port is already occupied; choose other ports or stop its owner.")
    env = os.environ.copy()
    # Preserve explicit clone and provider configuration. Only own Kokoro routing.
    env["LEEWAY_KOKORO_PORT"] = str(args.voice_port)
    env["LEEWAY_KOKORO_URL"] = f"http://127.0.0.1:{args.voice_port}"
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    if args.setup and not args.check:
        npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
        if not npm:
            parser.error("npm is required for --setup.")
        subprocess.run([npm, "ci"], cwd=adapter, env=env, creationflags=flags, check=True)
        subprocess.run([sys.executable, str(adapter / "download-model.py")], cwd=root, env=env, creationflags=flags, check=True)
    installed = (adapter / "node_modules" / "kokoro-js").is_dir()
    model = adapter / "models" / "kokoro" / "onnx" / "model_quantized.onnx"
    if not installed or not model.is_file():
        parser.error("Local dependencies/model are missing. Run this launcher with --setup.")
    if args.check:
        print("Runtime paths, dependencies, model presence and ports checked. No processes started; model hash is verified by the voice worker on load.")
        return
    children = []
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    try:
        children.append(subprocess.Popen([node, str(adapter / "server.mjs")], cwd=adapter, env=env, creationflags=flags))
        children.append(subprocess.Popen([sys.executable, str(root / "adapters" / "studio-server.py"), "--port", str(args.port), "--directory", str(root)], cwd=root, env=env, creationflags=flags))
        print(f"Open http://127.0.0.1:{args.port}/studio.html ; Ctrl+C stops this launcher's services.", flush=True)
        print("Models may still be warming up; check the studio's service status.", flush=True)
        while all(child.poll() is None for child in children):
            time.sleep(0.5)
        failed = next(child for child in children if child.poll() is not None)
        raise RuntimeError(f"A studio service exited (status {failed.returncode}).")
    except KeyboardInterrupt:
        print("Stopping owned studio services.", flush=True)
    finally:
        stop(children)


if __name__ == "__main__":
    main()
