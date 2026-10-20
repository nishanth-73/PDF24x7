"""Builds docs/index.html (the privacy policy and terms, for Google Play's privacy-policy URL and GitHub Pages) from
the text inside the app (Consent.kt), so the web page and the in-app screen always say the same thing.

    python scripts/build_policy_page.py
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = (ROOT / "app/src/main/java/com/sammyi57/pdftools/Consent.kt").read_text(encoding="utf-8")
APP = (ROOT / "app/src/main/java/com/sammyi57/pdftools/App.kt").read_text(encoding="utf-8")

contact = re.search(r'private const val CONTACT = "([^"]+)"', SRC).group(1)
updated = re.search(r'const val UPDATED = "([^"]+)"', APP).group(1)


def block(name: str) -> str:
    return re.search(r'private val %s = """(.*?)"""' % name, SRC, re.S).group(1).replace("$CONTACT", contact)


def render(text: str) -> str:
    out = []
    for para in text.split("\n\n"):
        lines = para.split("\n")
        if re.match(r"^\d+\. ", lines[0]):
            out.append(f"<h3>{html.escape(lines[0])}</h3>")
            lines = lines[1:]
        if lines:
            body = html.escape(" ".join(lines))
            body = body.replace(html.escape(contact), f'<a href="mailto:{contact}">{contact}</a>')
            out.append(f"<p>{body}</p>")
    return "\n".join(out)


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PDF Tools: Privacy Policy and Terms</title>
<meta name="description" content="Privacy policy and terms for PDF Tools, a free Android app with 24 PDF tools and a document scanner. Everything runs on your phone.">
<style>
  :root { --paper:#F6F2EE; --ink:#351E28; --sub:#7B6870; --accent:#FF5C34; --card:#FFFFFF; --line:#E9E1DC; }
  @media (prefers-color-scheme: dark) { :root { --paper:#111110; --ink:#EDEDEB; --sub:#9C9C99; --card:#1A1A18; --line:#2A2A27; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.65 -apple-system,"Segoe UI",Roboto,sans-serif; }
  header { background:#351E28; color:#fff; padding:44px 20px 38px; text-align:center;
           background-image:radial-gradient(circle at 85% 120%, #FF5C34 0, #8C2F2A 38%, #351E28 75%); }
  header h1 { margin:0 0 6px; font-size:2rem; letter-spacing:-.02em; }
  header p { margin:0; color:#D7EFFF; }
  main { max-width:720px; margin:0 auto; padding:28px 20px 64px; }
  nav { display:flex; gap:10px; margin:0 0 22px; flex-wrap:wrap; }
  nav a { padding:8px 16px; border-radius:999px; background:var(--card); border:1px solid var(--line); color:var(--ink); text-decoration:none; font-weight:600; font-size:.9rem; }
  nav a:hover { border-color:var(--accent); }
  section { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:8px 24px 18px; margin:0 0 22px; }
  h2 { font-size:1.35rem; margin:20px 0 4px; }
  h3 { font-size:1rem; margin:22px 0 2px; color:var(--accent); }
  p { margin:6px 0; color:var(--ink); }
  a { color:var(--accent); }
  .meta { color:var(--sub); font-size:.9rem; margin:0 0 6px; }
  footer { text-align:center; color:var(--sub); font-size:.85rem; padding-bottom:32px; }
</style>
</head>
<body>
<header>
  <h1>PDF Tools</h1>
  <p>Privacy policy and terms</p>
</header>
<main>
  <nav><a href="#privacy">Privacy Policy</a><a href="#terms">Terms &amp; Conditions</a></nav>
  <section id="privacy">
    <h2>Privacy Policy</h2>
    <p class="meta">Last updated __UPDATED__</p>
    __PRIVACY__
  </section>
  <section id="terms">
    <h2>Terms &amp; Conditions</h2>
    <p class="meta">Last updated __UPDATED__</p>
    __TERMS__
  </section>
</main>
<footer>PDF Tools &middot; <a href="https://github.com/sammyZi/pdf-tools">Source on GitHub</a> &middot; <a href="mailto:__CONTACT__">__CONTACT__</a></footer>
</body>
</html>
"""

page = (PAGE.replace("__UPDATED__", updated).replace("__CONTACT__", contact)
        .replace("__PRIVACY__", render(block("PRIVACY"))).replace("__TERMS__", render(block("TERMS"))))
out = ROOT / "docs" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(page, encoding="utf-8")
print("wrote", out, f"({len(page)} bytes), contact={contact}, updated={updated}")
