"""Operator utility: encrypt the approved library and publish ciphertext only."""
import base64
import os
import subprocess
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from standards_prepare import prepare


if __name__ == '__main__':
    source = Path(sys.argv[1])
    gh = sys.argv[2] if len(sys.argv) > 2 else 'gh'
    key = AESGCM.generate_key(bit_length=256)
    encoded = base64.b64encode(key).decode('ascii')
    nonce = os.urandom(12)
    target = Path('.ops-download/ops-library.enc')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(nonce + AESGCM(key).encrypt(nonce, source.read_bytes(), b'bk8-ops-v1'))
    print('Indexed pages:', prepare(target, encoded))
    subprocess.run([gh, 'secret', 'set', 'OPS_LIBRARY_KEY'], input=encoded, text=True, check=True)
    subprocess.run([gh, 'release', 'create', 'ops-library-v1', str(target), '--title', 'Encrypted OPS library',
                    '--notes', 'AES-256-GCM encrypted standards. Decryption key is stored only in Actions secrets.', '--latest=false'], check=True)
