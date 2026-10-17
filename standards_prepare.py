"""Decrypt the OPS library on the runner and build its local search index."""
import base64
import io
import os
import zipfile
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from standards_library import ROOT, build_index


def prepare(source, key, root=ROOT):
    payload = Path(source).read_bytes()
    plain = AESGCM(base64.b64decode(key)).decrypt(payload[:12], payload[12:], b'bk8-ops-v1')
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(plain)) as archive:
        if sum(item.file_size for item in archive.infolist()) > 300_000_000:
            raise ValueError('Архив слишком большой')
        for index, item in enumerate(archive.infolist()):
            if not item.filename.lower().endswith('.pdf') or item.is_dir():
                continue
            # ZIP names can contain legacy DOS encoding; keep a readable title.
            name = Path(item.filename.replace('\\', '/')).name
            try:
                name = name.encode('cp437').decode('cp866')
            except (UnicodeError, LookupError):
                pass
            (root / f'{index + 1:02d}-{name}').write_bytes(archive.read(item))
    return build_index(root)


if __name__ == '__main__':
    print('Indexed pages:', prepare('.ops-download/ops-library.enc', os.environ['OPS_LIBRARY_KEY']))
