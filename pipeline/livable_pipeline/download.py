import urllib.request
from pathlib import Path


def fetch(url: str, dest: Path) -> Path:
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(".part")  # rename last so an interrupted download is never mistaken for a complete file
    urllib.request.urlretrieve(url, part)
    part.rename(dest)
    return dest
