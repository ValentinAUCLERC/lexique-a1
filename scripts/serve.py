"""Serveur statique pour le site, avec support des requêtes Range (indispensable pour
avancer dans un audio sous Chrome/Safari). Stdlib uniquement.

Usage : python3 scripts/serve.py [port=8091] [dossier=site]
"""
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8091
DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "site")


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript; charset=utf-8",
                      ".mp3": "audio/mpeg", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8"}

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
        size = os.path.getsize(path)
        if not m or (not m.group(1) and not m.group(2)):
            return super().send_head()
        if m.group(1):
            start = int(m.group(1))
            end = min(int(m.group(2)), size - 1) if m.group(2) else size - 1
        else:  # suffixe : derniers N octets
            start, end = max(0, size - int(m.group(2))), size - 1
        if start >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def copyfile(self, source, outputfile):
        n = getattr(self, "_remaining", None)
        if n is None:
            return super().copyfile(source, outputfile)
        while n > 0:
            buf = source.read(min(64 * 1024, n))
            if not buf:
                break
            outputfile.write(buf)
            n -= len(buf)
        self._remaining = None

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"http://0.0.0.0:{PORT}/  ({DIR})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), partial(Handler, directory=DIR)).serve_forever()
