import getpass
import os
from pathlib import Path
import sys
import tempfile


def main():
    name, = sys.argv[1:]
    template = Path(__file__).parent / "env" / (name + ".env.example")
    if name not in {"frontend", "backend", "tunnel", "backup", "restore"}:
        raise ValueError("Unknown environment")
    directory = Path.home() / ".config" / "gdg"
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open("/dev/tty", "rb", buffering=0):
        lines = []
        for key in template.read_text().splitlines():
            value = getpass.getpass(key)
            if not value or any(c in value for c in "\r\n\0") or value != value.strip() or any(c in value for c in "'\"\\"):
                raise ValueError("Use a single nonempty unquoted value without backslashes or surrounding whitespace")
            lines.append(key + value)
    with tempfile.NamedTemporaryFile(mode="w", dir=directory, delete=False) as out:
        out.write("\n".join(lines) + "\n")
    os.replace(out.name, directory / (name + ".env"))


if __name__ == "__main__":
    main()
