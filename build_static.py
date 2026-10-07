import json
import shutil
from pathlib import Path

import db

ROOT = Path(__file__).parent
WEB = ROOT / "web"
OUT = ROOT / "docs"


def main():
    OUT.mkdir(exist_ok=True)
    for path in WEB.iterdir():
        shutil.copy(path, OUT / path.name)

    data = db.export_data()
    (OUT / "data.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    (OUT / ".nojekyll").touch()  # tells github pages not to run jekyll
    print(f"Wrote {len(data['products'])} products to {OUT}")


if __name__ == "__main__":
    main()
