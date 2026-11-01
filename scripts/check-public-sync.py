#!/usr/bin/env python3
"""Fail closed before synchronizing the private repository to the public mirror.

Checks only tracked paths; Gitleaks separately scans file contents.
"""
from __future__ import annotations

import pathlib
import subprocess
import sys

SECRET_NAMES = {
    ".npmrc", ".pypirc", "credentials.json", "secrets.json",
    "service-account.json", "service_account.json",
    "id_rsa", "id_ed25519", "id_ecdsa",
}
SECRET_SUFFIXES = (".pem", ".p12", ".pfx", ".jks", ".keystore", ".key")
PUBLISHED_DIRS = (".github/workflows/", "LICENSES/", "docs/", "public/", "scripts/", "src/", "tests/")
PUBLISHED_FILES = {
    ".gitattributes", ".gitignore", "CLAUDE.md", "LICENSE", "README.md",
    "index.html", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts",
}


def published(path: str) -> bool:
    return path in PUBLISHED_FILES or path.startswith(PUBLISHED_DIRS)


def looks_like_secret(path: str) -> bool:
    for part in pathlib.PurePosixPath(path).parts:
        part = part.lower()
        if part.startswith((".env", ".dev.vars")):
            return True
        if part in SECRET_NAMES or part.endswith(SECRET_SUFFIXES):
            return True
        if part == ".ssh" or "service-account" in part or "service_account" in part:
            return True
    return False


def main() -> int:
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    raw = subprocess.check_output(["git", "-C", str(root), "ls-files", "--stage", "-z"])
    violations = []
    total = 0
    published_count = 0
    for item in raw.split(b"\0"):
        if not item:
            continue
        metadata, path_bytes = item.split(b"\t", 1)
        mode = metadata.split(b" ", 1)[0]
        path = path_bytes.decode("utf-8", errors="surrogateescape")
        total += 1
        if looks_like_secret(path):
            violations.append(("secret-like filename", path))
        if published(path):
            published_count += 1
            if mode in (b"120000", b"160000"):
                violations.append(("symlink/submodule in public output", path))
    if violations:
        for category, path in violations:
            print(f"PUBLIC_SYNC_BLOCKED ({category}): {path}", file=sys.stderr)
        return 1
    if not published_count:
        print("PUBLIC_SYNC_BLOCKED: no approved publish files", file=sys.stderr)
        return 1
    print(f"PUBLIC_SYNC_PREFLIGHT_OK: {total} tracked, {published_count} approved public paths")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
