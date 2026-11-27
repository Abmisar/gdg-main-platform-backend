import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types

sys.modules['boto3'] = types.ModuleType('boto3')
sys.modules['botocore'] = types.ModuleType('botocore')
config = types.ModuleType('botocore.config')
config.Config = object
sys.modules['botocore.config'] = config
spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).with_name('snapshot.py'))
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    identity = root / 'identity'
    subprocess.run(['age-keygen', '-o', str(identity)], check=True, stderr=subprocess.DEVNULL)
    recipient = subprocess.check_output(['age-keygen', '-y', str(identity)], text=True).strip()
    os.environ['AGE_IDENTITY_FILE'] = str(identity)
    data = b'example dump\x00' * 1000
    uploaded = root / 'uploaded.age'
    snapshot.encrypt(io.BytesIO(data), uploaded, recipient)
    assert data not in uploaded.read_bytes()
    snapshot.decrypt(uploaded, root / 'restored')
    assert (root / 'restored').read_bytes() == data
    corrupted = bytearray(uploaded.read_bytes())
    corrupted[-1] ^= 1
    uploaded.write_bytes(corrupted)
    try:
        snapshot.decrypt(uploaded, root / 'corrupt')
    except subprocess.CalledProcessError:
        pass
    else:
        raise AssertionError('Corruption was not detected')
print('Encryption round trip and integrity check passed')
