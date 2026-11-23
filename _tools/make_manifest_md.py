#!/usr/bin/env python3
"""Render MANIFEST.md (human-readable inventory) from manifest.json."""

from __future__ import annotations

import json
import os
from collections import OrderedDict

OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

TIER_FA = {
    "core": "هسته — خودِ فیچر تولید محتوا",
    "shared": "مشترک — وابستگی واقعی و دستی‌اعلام‌شدهٔ فیچر",
    "auto": "خودکار — با پیمایش ترابرِد importها کشیده شده (زنجیرهٔ علت در ستون «چرا»)",
    "reference": "مرجع — جزو فیچر نیست؛ فقط برای دیدن نقاط اتصال کپی شده",
}
REPO_FA = {"backend": "بک‌اند (NestJS)", "frontend": "فرانت‌اند (React + Vite)"}


def human(n: int) -> str:
    return f"{n:,}"


def main() -> None:
    with open(os.path.join(OUT, "manifest.json"), encoding="utf-8") as fh:
        m = json.load(fh)

    rows = m["files"]
    L: list[str] = []
    A = L.append

    A("# فهرست کامل فایل‌های استخراج‌شده")
    A("")
    A("این فایل به‌صورت خودکار از `manifest.json` ساخته می‌شود. دست‌کاری‌اش نکنید؛")
    A("به‌جایش `_tools/extract.py` را دوباره اجرا کنید.")
    A("")
    A(f"- تاریخ تولید: `{m['generated_at']}`")
    A(f"- کامیت بک‌اند: `{m['sources']['backend']['commit'][:12]}`")
    A(f"- کامیت فرانت‌اند: `{m['sources']['frontend']['commit'][:12]}`")
    A(f"- مجموع: **{human(m['totals']['files'])} فایل**، "
      f"**{human(m['totals']['lines'])} خط**، **{human(m['totals']['bytes'])} بایت**")
    A("")
    A("هر فایل پس از کپی با `sha256` در برابر مبدأ راستی‌آزمایی شده است؛ ستون آخر همان مقدار است.")
    A("")

    # ---- summary table ----------------------------------------------------
    A("## ۱) خلاصه بر اساس لایه")
    A("")
    A("| مخزن | لایه | فایل | خط | بایت |")
    A("| --- | --- | --- | --- | --- |")
    for repo in ("backend", "frontend"):
        for tier in ("core", "shared", "auto", "reference"):
            sel = [r for r in rows if r["repo"] == repo and r["tier"] == tier]
            if not sel:
                continue
            A(f"| {REPO_FA[repo]} | `{tier}` | {len(sel)} | "
              f"{human(sum(r['lines'] for r in sel))} | {human(sum(r['bytes'] for r in sel))} |")
    A(f"| **مجموع** | | **{human(m['totals']['files'])}** | "
      f"**{human(m['totals']['lines'])}** | **{human(m['totals']['bytes'])}** |")
    A("")

    # ---- group table ------------------------------------------------------
    A("## ۲) خلاصه بر اساس گروه کارکردی")
    A("")
    A("| گروه | مخزن | لایه | فایل | خط |")
    A("| --- | --- | --- | --- | --- |")
    groups: "OrderedDict[tuple, list]" = OrderedDict()
    for r in rows:
        groups.setdefault((r["group"], r["repo"], r["tier"]), []).append(r)
    for (group, repo, tier), sel in groups.items():
        A(f"| {group} | {REPO_FA[repo]} | `{tier}` | {len(sel)} | {human(sum(x['lines'] for x in sel))} |")
    A("")

    # ---- full inventory ---------------------------------------------------
    A("## ۳) فهرست کامل فایل‌ها")
    A("")
    for repo in ("backend", "frontend"):
        A(f"### {REPO_FA[repo]}")
        A("")
        for tier in ("core", "shared", "auto", "reference"):
            sel = [r for r in rows if r["repo"] == repo and r["tier"] == tier]
            if not sel:
                continue
            A(f"#### لایهٔ `{tier}` — {TIER_FA[tier]}")
            A("")
            A("| # | مسیر (همان مسیر اصلی در مش) | خط | بایت | sha256 (۱۲ رقم) |")
            A("| --- | --- | --- | --- | --- |")
            for i, r in enumerate(sel, 1):
                A(f"| {i} | `{r['path']}` | {human(r['lines'])} | {human(r['bytes'])} | `{r['sha256'][:12]}` |")
            A("")

    # ---- why each spec ----------------------------------------------------
    # ---- cut points -------------------------------------------------------
    A("## ۴) لبه‌های پل — جاهایی که اگر قطع کنید، استخراج کوچک می‌شود")
    A("")
    A("این‌ها یال‌هایی در گراف import هستند که بیشترین حجم لایهٔ `auto` از آن‌ها عبور می‌کند.")
    A("اگر این فیچر را در پروژه‌ای تازه می‌کارید، همین چند نقطه را stub کنید.")
    A("")
    A("| یال | مخزن | فایل‌های `auto` عبوری | خط | توضیح |")
    A("| --- | --- | --- | --- | --- |")
    for c in m.get("cut_points", []):
        A(f"| `{c['edge']}` | {REPO_FA[c['repo']]} | {c['auto_files_through_it']} | "
          f"{human(c['lines_through_it'])} | {c['explanation']} |")
    A("")

    # ---- closure ----------------------------------------------------------
    cl = m.get("closure", {})
    A("## ۵) وضعیت بستار importها")
    A("")
    A(f"- importهای نسبیِ حل‌نشده: **{cl.get('unresolved_count', 0)}**")
    A("- همهٔ آن‌ها از فایل‌های لایهٔ `reference` (مثل `router.tsx` و `app.module.ts`)")
    A("  و فایل‌های `test/` و `e2e/` می‌آیند؛ این فایل‌ها عمداً پیمایش نمی‌شوند چون")
    A("  کل اپلیکیشن را import می‌کنند. **هیچ import حل‌نشده‌ای از کد خودِ فیچر وجود ندارد.**")
    A("")
    unresolved = cl.get("unresolved", [])
    if unresolved:
        byfile: "OrderedDict[str, int]" = OrderedDict()
        for x in unresolved:
            k = f"{x['repo']}:{x['file']}"
            byfile[k] = byfile.get(k, 0) + 1
        A("| فایل اعلام‌کننده | تعداد ارجاع بیرونی |")
        A("| --- | --- |")
        for k, v in sorted(byfile.items(), key=lambda kv: -kv[1]):
            A(f"| `{k}` | {v} |")
        A("")

    # ---- why chains -------------------------------------------------------
    auto = [r for r in rows if r["tier"] == "auto" and r.get("why")]
    if auto:
        A("## ۶) زنجیرهٔ علت برای فایل‌های لایهٔ `auto`")
        A("")
        A("هر سطر نشان می‌دهد کدام فایلِ اعلام‌شده باعث کشیده‌شدن این فایل شده است.")
        A("")
        A("| فایل | مخزن | زنجیره (از ریشه) |")
        A("| --- | --- | --- |")
        for r in auto:
            chain = " ← ".join(f"`{os.path.basename(x)}`" for x in r["why"])
            A(f"| `{r['path']}` | {REPO_FA[r['repo']]} | {chain} |")
        A("")

    A("## ۷) دلیل حضور هر مجموعه")
    A("")
    A("| مجموعه | مخزن | لایه | چرا اینجاست |")
    A("| --- | --- | --- | --- |")
    seen = set()
    for r in rows:
        key = (r["repo"], r["spec"])
        if key in seen or not r["note"] or r["tier"] == "auto":
            continue
        seen.add(key)
        A(f"| `{r['spec']}` | {REPO_FA[r['repo']]} | `{r['tier']}` | {r['note']} |")
    A("")

    path = os.path.join(OUT, "MANIFEST.md")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    print(f"wrote {path} ({len(L)} lines)")


if __name__ == "__main__":
    main()
