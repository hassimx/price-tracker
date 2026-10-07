import hashlib
import json
import shutil
from pathlib import Path

import db

ROOT = Path(__file__).parent
WEB = ROOT / "web"
OUT = ROOT / "docs"
ASSETS = ["style.css", "common.js", "index.js", "product.js"]


def add_versions():
    # browsers cache files for a while, a hash in the url makes them load the new file
    for page in OUT.glob("*.html"):
        html = page.read_text(encoding="utf-8")
        for name in ASSETS:
            digest = hashlib.md5((OUT / name).read_bytes()).hexdigest()[:8]
            html = html.replace(f'"{name}"', f'"{name}?v={digest}"')
        page.write_text(html, encoding="utf-8")


def main():
    OUT.mkdir(exist_ok=True)
    for path in WEB.iterdir():
        shutil.copy(path, OUT / path.name)
    add_versions()

    data = db.export_data()
    (OUT / "data.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    (OUT / ".nojekyll").touch()  # tells github pages not to run jekyll
    print(f"Wrote {len(data['products'])} products to {OUT}")


if __name__ == "__main__":
    main()
