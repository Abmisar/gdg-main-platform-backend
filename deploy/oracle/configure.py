import getpass
import ipaddress
import os
import re
from pathlib import Path
import sys
import tempfile


def main():
    target, name = sys.argv[1:]
    if target not in {"dev", "prod"} or target == "dev" and name not in {"frontend", "backend", "network", "migration"}:
        raise ValueError("Unknown target or service")
    template = Path(__file__).parent / "env" / (name + ".env.example")
    if name not in {"frontend", "backend", "tunnel", "backup", "restore", "network", "postgres", "migration", "backend.jeddah", "backup.jeddah", "restore.jeddah"}:
        raise ValueError("Unknown environment")
    directory = Path.home() / ".config" / "gdg" / target
    if name.endswith(".jeddah") or name == "postgres":
        directory = directory / "jeddah"
        name = name.split(".")[0]
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open("/dev/tty", "rb", buffering=0):
        lines = []
        for key in template.read_text().splitlines():
            value = getpass.getpass(key)
            if key == "CSP_REPORT_URI=" and not value:
                lines.append(key)
                continue
            if key == "SECURITY_ALERT_EMAIL=" and not re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", value):
                raise ValueError("Enter a single security role mailbox address")
            if key == "APP_NETWORK_PREFIX=":
                network = ipaddress.IPv4Network(value + ".0/24")
                first, second, *_ = network.network_address.packed
                if not (first == 10 or first == 172 and 16 <= second <= 31 or
                        first == 192 and second == 168):
                    raise ValueError("Choose a free RFC 1918 /24 prefix")
            if key == "AGE_IDENTITY_FILE=" and not os.path.isabs(value):
                raise ValueError("Use an absolute identity file path")
            if key == "API_PROXY_TARGET=" and value != "http://gdg-backend:3001":
                raise ValueError("Use the internal Oracle backend origin")
            if not value or any(c in value for c in "\r\n\0") or value != value.strip() or any(c in value for c in "'\\"):
                raise ValueError("Use a single nonempty unquoted value without backslashes or surrounding whitespace")
            lines.append(key + value)
    with tempfile.NamedTemporaryFile(mode="w", dir=directory, delete=False) as out:
        out.write("\n".join(lines) + "\n")
    os.replace(out.name, directory / (name + ".env"))


if __name__ == "__main__":
    main()
