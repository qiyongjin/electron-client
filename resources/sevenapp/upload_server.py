"""Standalone local chunk receiver; compatible with electronAPI.upload (stdlib only)."""
import argparse
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import threading
import time
import uuid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_CHUNK_BYTES = 16 * 1024 * 1024
READ_BYTES = 1024 * 1024
DEFAULT_PORT = 17892  # Keep independent from the embedded Node server (17891).
DEFAULT_DIRECTORY = Path(__file__).resolve().parent / 'uploads'
HASH = re.compile(r'[a-f0-9]{64}')
ROUTE = re.compile(r'/uploads/([a-f0-9]{64}-[0-9]+)/(?:chunks/([0-9]+)|(complete))')


class UploadError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def validate_manifest(value):
    if not isinstance(value, dict):
        raise UploadError(400, 'Invalid manifest')
    name, size, chunk, total = (value.get(k) for k in ('name', 'size', 'chunkSize', 'totalChunks'))
    file_hash = value.get('fileHash')
    if (not isinstance(name, str) or not 1 <= len(name) <= 255
            or not isinstance(file_hash, str) or not HASH.fullmatch(file_hash)
            or type(size) is not int or not 0 <= size <= 2**53 - 1
            or type(chunk) is not int or not 1 <= chunk <= MAX_CHUNK_BYTES
            or type(total) is not int or total != (size + chunk - 1) // chunk
            or total > 1000000):
        raise UploadError(400, 'Invalid manifest')
    return dict(name=name, size=size, chunkSize=chunk, totalChunks=total, fileHash=file_hash)


def chunk_size(meta, index):
    return min(meta['chunkSize'], meta['size'] - index * meta['chunkSize'])


def digest(file):
    sha = hashlib.sha256()
    size = 0
    with file.open('rb') as stream:
        while True:
            block = stream.read(READ_BYTES)
            if not block:
                break
            sha.update(block)
            size += len(block)
    return sha.hexdigest(), size


def atomic_json(file, value):
    temp = file.with_name(file.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temp.open('x', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, file)
    finally:
        temp.unlink(missing_ok=True)


class UploadServer(ThreadingHTTPServer):
    daemon_threads = False
    allow_reuse_address = True

    def __init__(self, address, directory, fail_first=False, delay_ms=0):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.guard = threading.Lock()
        self.busy = set()
        self.failed = set()
        self.fail_first = fail_first
        self.delay_ms = delay_ms
        super().__init__(address, UploadHandler)

    @contextmanager
    def operation(self, upload_id, index=None):
        key = (upload_id, index)
        with self.guard:
            conflict = ((upload_id, None) in self.busy or key in self.busy
                        or (index is None and any(item[0] == upload_id for item in self.busy)))
            if conflict:
                raise UploadError(503, 'Upload busy; retry')
            self.busy.add(key)
        try:
            yield
        finally:
            with self.guard:
                self.busy.discard(key)


class UploadHandler(BaseHTTPRequestHandler):
    # One request per connection; errors cannot leave unread bytes on reused sockets.
    protocol_version = 'HTTP/1.0'

    def setup(self):
        super().setup()
        self.connection.settimeout(120)

    def log_message(self, fmt, *args):
        logging.info('%s %s', self.client_address[0], fmt % args)

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def length(self):
        if self.headers.get('Transfer-Encoding'):
            raise UploadError(400, 'Use Content-Length, not Transfer-Encoding')
        try:
            size = int(self.headers['Content-Length'])
            if size < 0:
                raise ValueError()
            return size
        except (ValueError, TypeError):
            raise UploadError(411, 'Content-Length required')

    def do_GET(self):
        if self.path == '/health':
            self.reply(200, {'status': 'ok', 'directory': str(self.server.directory)})
        else:
            self.reply(404, {'error': 'Not found'})

    def do_POST(self):
        self.dispatch()

    def do_PUT(self):
        self.dispatch()

    def dispatch(self):
        try:
            if self.command == 'POST' and self.path == '/uploads/init':
                length = self.length()
                if length > 8192:
                    raise UploadError(413, 'Metadata too large')
                try:
                    meta = validate_manifest(json.loads(self.rfile.read(length)))
                except (ValueError, UnicodeError):
                    raise UploadError(400, 'Invalid JSON')
                self.initialize(meta)
                return
            match = ROUTE.fullmatch(self.path)
            if not match:
                raise UploadError(404, 'Unknown route')
            upload_id, index, complete = match.groups()
            directory = self.server.directory / upload_id
            try:
                meta = validate_manifest(json.loads((directory / 'manifest.json').read_text('utf-8')))
            except (OSError, ValueError):
                raise UploadError(404, 'Upload not initialized')
            if self.command == 'PUT' and index is not None:
                self.receive(upload_id, directory, meta, int(index))
            elif self.command == 'POST' and complete:
                self.merge(upload_id, directory, meta)
            else:
                raise UploadError(405, 'Method not allowed')
        except (BrokenPipeError, ConnectionResetError):
            logging.info('Client disconnected (paused or cancelled)')
        except Exception as error:
            status = error.status if isinstance(error, UploadError) else 500
            if status == 500:
                logging.exception('Upload request failed')
            try:
                self.reply(status, {'error': str(error)})
            except (BrokenPipeError, ConnectionResetError):
                pass

    def initialize(self, meta):
        upload_id = f"{meta['fileHash']}-{meta['chunkSize']}"
        directory = self.server.directory / upload_id
        with self.server.operation(upload_id):
            directory.mkdir(exist_ok=True)
            manifest = directory / 'manifest.json'
            if manifest.exists():
                old = json.loads(manifest.read_text('utf-8'))
                if any(old[k] != meta[k] for k in ('fileHash', 'size', 'chunkSize', 'totalChunks')):
                    raise UploadError(409, 'Manifest mismatch')
            else:
                atomic_json(manifest, meta)
            uploaded = []
            for index in range(meta['totalChunks']):
                try:
                    saved = json.loads((directory / f'{index}.json').read_text('utf-8'))
                    actual, size = digest(directory / f'{index}.part')
                    if actual == saved['hash'] and size == chunk_size(meta, index):
                        uploaded.append(index)
                except (OSError, ValueError, KeyError):
                    pass  # Missing or corrupted data is uploaded again.
        self.reply(200, {'uploadId': upload_id, 'uploaded': uploaded})

    def receive(self, upload_id, directory, meta, index):
        expected_hash = self.headers.get('x-chunk-sha256', '')
        if index >= meta['totalChunks'] or not HASH.fullmatch(expected_hash):
            raise UploadError(400, 'Invalid chunk')
        size = chunk_size(meta, index)
        if self.length() != size:
            raise UploadError(422, 'Chunk size mismatch')
        with self.server.operation(upload_id, index):
            key = (upload_id, index)
            with self.server.guard:
                if self.server.fail_first and key not in self.server.failed:
                    self.server.failed.add(key)
                    raise UploadError(503, 'Injected first-attempt failure')
            time.sleep(self.server.delay_ms / 1000)
            temp = directory / f'{index}.{uuid.uuid4().hex}.tmp'
            try:
                sha = hashlib.sha256()
                remaining = size
                with temp.open('xb') as output:
                    while remaining:
                        block = self.rfile.read(min(READ_BYTES, remaining))
                        if not block:
                            raise UploadError(400, 'Incomplete chunk')
                        output.write(block)
                        sha.update(block)
                        remaining -= len(block)
                    output.flush()
                    os.fsync(output.fileno())
                if sha.hexdigest() != expected_hash:
                    raise UploadError(422, 'Chunk checksum mismatch')
                os.replace(temp, directory / f'{index}.part')
                atomic_json(directory / f'{index}.json', {'hash': expected_hash, 'size': size})
            finally:
                temp.unlink(missing_ok=True)
        self.reply(200, {'index': index, 'hash': expected_hash, 'size': size})

    def merge(self, upload_id, directory, meta):
        with self.server.operation(upload_id):
            temp = directory / f'merged.{uuid.uuid4().hex}.tmp'
            storage_name = f'{upload_id}.bin'
            try:
                whole_hash = hashlib.sha256()
                total = 0
                with temp.open('xb') as output:
                    for index in range(meta['totalChunks']):
                        sha = hashlib.sha256()
                        size = 0
                        try:
                            saved = json.loads((directory / f'{index}.json').read_text('utf-8'))
                            with (directory / f'{index}.part').open('rb') as source:
                                while True:
                                    block = source.read(READ_BYTES)
                                    if not block:
                                        break
                                    output.write(block)
                                    sha.update(block)
                                    whole_hash.update(block)
                                    size += len(block)
                        except (OSError, ValueError):
                            raise UploadError(409, f'Missing chunk {index}; resume upload')
                        if size != chunk_size(meta, index) or sha.hexdigest() != saved.get('hash'):
                            raise UploadError(409, f'Corrupted chunk {index}; resume upload')
                        total += size
                    output.flush()
                    os.fsync(output.fileno())
                if total != meta['size'] or whole_hash.hexdigest() != meta['fileHash']:
                    raise UploadError(422, 'Whole-file checksum mismatch')
                os.replace(temp, self.server.directory / storage_name)
            finally:
                temp.unlink(missing_ok=True)
        self.reply(200, {'fileHash': meta['fileHash'], 'size': total, 'storageName': storage_name})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=DEFAULT_PORT)
    parser.add_argument('--directory', type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument('--fail-first', action='store_true', help='Fail each chunk first request with 503')
    parser.add_argument('--delay-ms', type=int, default=0)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535 or not 0 <= args.delay_ms <= 2000:
        parser.error('port must be 0–65535 and delay-ms 0–2000')
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    with UploadServer(('127.0.0.1', args.port), args.directory, args.fail_first, args.delay_ms) as server:
        logging.info('Upload server: http://127.0.0.1:%s', server.server_port)
        logging.info('Storage directory: %s', server.directory)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            logging.info('Stopping upload server')


if __name__ == '__main__':
    main()
