"""Resilient parallel downloader for all 31 official U.S. public data sources."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from .manifest import SOURCES, DataSourceSpec, SourceFile

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PIPELINE_ROOT / "data_raw"
MANIFEST_OUT = RAW_DIR / "_download_manifest.json"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download_one(source: DataSourceSpec, sf: SourceFile, force: bool = False) -> dict:
    dest = RAW_DIR / sf.rel_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 100 and not force:
        return {
            "source_id": source.id,
            "rel_path": sf.rel_path,
            "url": sf.url,
            "status": "cached",
            "bytes": dest.stat().st_size,
            "optional": sf.optional,
        }

    tmp = dest.with_suffix(dest.suffix + ".part")
    cmd = [
        "curl",
        "-sSL",
        "--fail",
        "--retry", "3",
        "--retry-delay", "2",
        "--connect-timeout", "20",
        "--max-time", "240",
        "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) TerraAmericana-Research/1.0",
        "-o", str(tmp),
        sf.url,
    ]
    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True)
    dt = round(time.time() - t0, 2)

    if proc.returncode != 0 or not tmp.exists() or tmp.stat().st_size < 50:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        return {
            "source_id": source.id,
            "rel_path": sf.rel_path,
            "url": sf.url,
            "status": "failed",
            "error": (proc.stderr or f"exit {proc.returncode}").strip()[:240],
            "elapsed_s": dt,
            "optional": sf.optional,
        }

    # Quick sanity check: reject accidental HTML error pages for non-html files
    head = tmp.read_bytes()[:256].lstrip()
    if head.startswith((b"<!DOCTYPE html", b"<html", b"<HTML")) and not sf.rel_path.endswith(".html"):
        tmp.unlink(missing_ok=True)
        return {
            "source_id": source.id,
            "rel_path": sf.rel_path,
            "url": sf.url,
            "status": "failed",
            "error": "Received HTML page instead of data file",
            "elapsed_s": dt,
            "optional": sf.optional,
        }

    tmp.replace(dest)
    return {
        "source_id": source.id,
        "rel_path": sf.rel_path,
        "url": sf.url,
        "status": "downloaded",
        "bytes": dest.stat().st_size,
        "sha256": sha256_file(dest),
        "elapsed_s": dt,
        "optional": sf.optional,
    }


def fetch_all(only_ids: set[str] | None = None, max_workers: int = 8, force: bool = False) -> list[dict]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    jobs: list[tuple[DataSourceSpec, SourceFile]] = []
    for src in SOURCES:
        if only_ids and src.id not in only_ids:
            continue
        for sf in src.files:
            jobs.append((src, sf))

    print(f"[fetch_all] Starting download of {len(jobs)} files across {len(SOURCES)} official sources (workers={max_workers})...")
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futs = {pool.submit(download_one, s, sf, force): (s.id, sf.rel_path) for s, sf in jobs}
        done = 0
        for fut in as_completed(futs):
            done += 1
            res = fut.result()
            results.append(res)
            tag = res["status"].upper()
            sz = f"{res.get('bytes', 0) / 1e6:.2f}MB" if "bytes" in res else res.get("error", "")
            print(f"  [{done:3d}/{len(jobs)}] {tag:10s} {res['source_id']:20s} {res['rel_path']} ({sz})", flush=True)

    # Summarize per source
    by_src: dict[str, list[dict]] = {}
    for r in results:
        by_src.setdefault(r["source_id"], []).append(r)

    required_fails = [r for r in results if r["status"] == "failed" and not r["optional"]]
    optional_fails = [r for r in results if r["status"] == "failed" and r["optional"]]
    ok_sources = sum(
        1 for sid, items in by_src.items()
        if all(it["status"] != "failed" or it["optional"] for it in items)
    )
    print(f"\n[fetch_all] Summary: {ok_sources}/{len(by_src)} sources complete | {len(required_fails)} required failures | {len(optional_fails)} optional failures")
    if required_fails:
        print("REQUIRED FAILURES:")
        for r in required_fails:
            print(f"  - [{r['source_id']}] {r['rel_path']}: {r['error']} | {r['url']}")

    MANIFEST_OUT.write_text(
        json.dumps(
            {
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "total_sources": len(SOURCES),
                "results": sorted(results, key=lambda x: (x["source_id"], x["rel_path"])),
            },
            indent=2,
        )
    )
    return results


if __name__ == "__main__":
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    res = fetch_all(only_ids=only)
    if any(r["status"] == "failed" and not r["optional"] for r in res):
        sys.exit(1)
