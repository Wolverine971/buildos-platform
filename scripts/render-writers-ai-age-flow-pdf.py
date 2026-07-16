#!/usr/bin/env python3
# scripts/render-writers-ai-age-flow-pdf.py
from __future__ import annotations

import math
import random
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps/web/static/downloads/writers-ai-age-flow.pdf"
TMP = ROOT / "tmp/pdfs/writers-ai-age-flow"

W, H = letter
M = 48
CONTENT_W = W - 2 * M
GAP = 16
COL2_W = (CONTENT_W - GAP) / 2
COL2_X2 = M + COL2_W + GAP
COL3_GAP = 18
COL3_W = (CONTENT_W - 2 * COL3_GAP) / 3
COL4_GAP = 12
COL4_W = (CONTENT_W - 3 * COL4_GAP) / 4

PAPER = HexColor("#FAF9F6")
CARD = HexColor("#FFFDF8")
MUTED = HexColor("#F1EAE1")
INK = HexColor("#18181A")
INK_SOFT = HexColor("#4C4741")
INK_FAINT = HexColor("#7A7068")
AMBER = HexColor("#EA6D20")
AMBER_DARK = HexColor("#9A3F0E")
AMBER_PALE = HexColor("#F9E2D2")
BORDER = HexColor("#D8CEC2")
DARK = HexColor("#0F0F11")
DARK_CARD = HexColor("#191A1F")
GREEN = HexColor("#317A5A")
BLUE = HexColor("#355D7A")
RED = HexColor("#A84636")
GOLD = HexColor("#A46A12")

FONT_DISPLAY = "NewYork"
FONT_BODY = "Georgia"
FONT_BODY_BOLD = "GeorgiaBold"
FONT_UI = "SFNS"
FONT_MONO = "SFNSMono"


def register_fonts() -> None:
    fonts = {
        FONT_DISPLAY: "/System/Library/Fonts/NewYork.ttf",
        FONT_BODY: "/System/Library/Fonts/Supplemental/Georgia.ttf",
        FONT_BODY_BOLD: "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        FONT_UI: "/System/Library/Fonts/SFNS.ttf",
        FONT_MONO: "/System/Library/Fonts/SFNSMono.ttf",
    }
    for name, path in fonts.items():
        try:
            pdfmetrics.registerFont(TTFont(name, path))
        except Exception:
            pass


def width(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def wrap(text: str, font: str, size: float, max_width: float) -> list[str]:
    out: list[str] = []
    for para in text.split("\n"):
        words = para.split()
        if not words:
            out.append("")
            continue
        line = words[0]
        for word in words[1:]:
            trial = f"{line} {word}"
            if width(trial, font, size) <= max_width:
                line = trial
            else:
                out.append(line)
                line = word
        out.append(line)
    return out


def text_block(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    *,
    font: str = FONT_BODY,
    size: float = 10.5,
    leading: float = 14.5,
    color=INK_SOFT,
    max_lines: int | None = None,
) -> float:
    c.setFillColor(color)
    c.setFont(font, size)
    lines = wrap(text, font, size, max_width)
    if max_lines is not None:
        lines = lines[:max_lines]
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def label(c: canvas.Canvas, text: str, x: float, y: float, color=AMBER) -> None:
    c.setFillColor(color)
    c.setFont(FONT_UI, 7.2)
    c.drawString(x, y, text.upper())


def title(c: canvas.Canvas, text: str, x: float, y: float, max_width: float, size=30, color=INK) -> float:
    c.setFillColor(color)
    c.setFont(FONT_DISPLAY, size)
    leading = size * 1.05
    for line in wrap(text, FONT_DISPLAY, size, max_width):
        c.drawString(x, y, line)
        y -= leading
    return y


def round_rect(c: canvas.Canvas, x: float, y: float, w: float, h: float, fill, stroke=BORDER, r=8, sw=0.8) -> None:
    c.setLineWidth(sw)
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.roundRect(x, y, w, h, r, fill=1, stroke=1)


def draw_checkbox(c: canvas.Canvas, x: float, y: float, size=8, color=BORDER) -> None:
    c.setStrokeColor(color)
    c.setLineWidth(0.9)
    c.roundRect(x, y - size + 1, size, size, 1.5, fill=0, stroke=1)


def draw_rule(c: canvas.Canvas, x: float, y: float, w: float, color=BORDER, lw=0.75) -> None:
    c.setStrokeColor(color)
    c.setLineWidth(lw)
    c.line(x, y, x + w, y)


def col3_x(index: int) -> float:
    return M + index * (COL3_W + COL3_GAP)


def col4_x(index: int) -> float:
    return M + index * (COL4_W + COL4_GAP)


def draw_background(c: canvas.Canvas, page: int, dark: bool = False) -> None:
    c.setFillColor(DARK if dark else PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    rng = random.Random(1300 + page)
    speck = HexColor("#EFE7DD") if not dark else HexColor("#17181D")
    c.setFillColor(speck)
    for _ in range(130):
        x = rng.uniform(0, W)
        y = rng.uniform(0, H)
        r = rng.choice([0.25, 0.35, 0.45])
        c.circle(x, y, r, fill=1, stroke=0)
    grid = HexColor("#ECE3D8") if not dark else HexColor("#1B1C22")
    c.setStrokeColor(grid)
    c.setLineWidth(0.25)
    for x in range(0, int(W), 36):
        c.line(x, 0, x, H)
    for y in range(0, int(H), 36):
        c.line(0, y, W, y)


def footer(c: canvas.Canvas, page: int, section: str = "The Writer's AI-Age Flow") -> None:
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.6)
    c.line(M, 38, W - M, 38)
    c.setFont(FONT_UI, 7.4)
    c.setFillColor(INK_FAINT)
    c.drawString(M, 24, f"BuildOS / {section}")
    c.drawRightString(W - M, 24, f"{page:02d}")


def card_text(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    kicker: str,
    heading: str,
    body: str,
    *,
    fill=CARD,
    accent=AMBER,
    heading_size=13,
) -> None:
    round_rect(c, x, y - h, w, h, fill, BORDER, 8)
    c.setFillColor(accent)
    c.roundRect(x + 12, y - 18, 28, 5, 2.5, fill=1, stroke=0)
    label(c, kicker, x + 12, y - 33, accent)
    c.setFillColor(INK)
    c.setFont(FONT_UI, heading_size)
    hy = y - 51
    for line in wrap(heading, FONT_UI, heading_size, w - 24):
        c.drawString(x + 12, hy, line)
        hy -= heading_size + 3
    text_block(c, body, x + 12, hy - 5, w - 24, size=8.7, leading=11.6, max_lines=6)


def bullet_list(c: canvas.Canvas, items: list[str], x: float, y: float, w: float, *, size=9.8, leading=13.6) -> float:
    for item in items:
        c.setFillColor(AMBER)
        c.roundRect(x, y - 7, 5, 5, 1.2, fill=1, stroke=0)
        y = text_block(c, item, x + 13, y, w - 13, size=size, leading=leading)
        y -= 5
    return y


def pill(c: canvas.Canvas, text: str, x: float, y: float, color=AMBER, fill=AMBER_PALE) -> None:
    c.setFont(FONT_UI, 8)
    tw = width(text, FONT_UI, 8)
    c.setFillColor(fill)
    c.setStrokeColor(color)
    c.setLineWidth(0.45)
    c.roundRect(x, y - 13, tw + 18, 18, 9, fill=1, stroke=1)
    c.setFillColor(color)
    c.drawString(x + 9, y - 8, text)


def open_page(c: canvas.Canvas, page: int, heading: str, kicker: str = "Field guide") -> float:
    draw_background(c, page)
    label(c, kicker, M, 725)
    y = title(c, heading, M, 704, CONTENT_W, 28.5)
    draw_rule(c, M, y - 8, CONTENT_W, AMBER, 1.2)
    return y - 34


def image_fit(c: canvas.Canvas, path: Path, x: float, y: float, w: float, h: float) -> None:
    img = ImageReader(str(path))
    iw, ih = img.getSize()
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, mask="auto")


def draw_cover(c: canvas.Canvas) -> None:
    draw_background(c, 1, dark=True)
    c.setFillColor(AMBER)
    c.rect(0, 0, 18, H, fill=1, stroke=0)
    logo = ROOT / "apps/web/static/buildos-logo-dark.png"
    image_fit(c, logo, M, 704, 138, 44)

    label(c, "Lead magnet / writer system", M, 635, AMBER)
    c.setFillColor(PAPER)
    c.setFont(FONT_DISPLAY, 44)
    for line in wrap("The Writer's AI-Age Flow", FONT_DISPLAY, 44, 470):
        c.drawString(M, 585, line)
        M_dummy = 0
        del M_dummy
        break
    c.drawString(M, 537, "for a Warm")
    c.drawString(M, 489, "Manuscript")
    c.setFillColor(HexColor("#D7D0C8"))
    c.setFont(FONT_BODY, 14)
    subtitle = "A practical field guide for keeping your book, voice, research, and next move warm - without handing authorship to AI."
    text_block(c, subtitle, M, 438, 430, font=FONT_BODY, size=14, leading=19, color=HexColor("#D7D0C8"))

    # Cover diagram.
    cx, cy = 405, 208
    c.setStrokeColor(HexColor("#343641"))
    c.setLineWidth(1)
    for r in [52, 92, 132]:
        c.circle(cx, cy, r, fill=0, stroke=1)
    c.setFillColor(AMBER)
    c.circle(cx, cy, 34, fill=1, stroke=0)
    c.setFillColor(DARK)
    c.setFont(FONT_UI, 8)
    c.drawCentredString(cx, cy + 3, "PROJECT")
    c.drawCentredString(cx, cy - 8, "BRAIN")
    nodes = [
        ("Orient", -126, 16),
        ("Capture", -95, 96),
        ("Sort", -10, 132),
        ("Remember", 94, 92),
        ("Stage", 128, 4),
        ("Draft", 70, -108),
        ("Revise", -47, -126),
        ("Close out", -122, -65),
    ]
    for name, dx, dy in nodes:
        x, y = cx + dx, cy + dy
        c.setStrokeColor(AMBER)
        c.setLineWidth(0.8)
        c.line(cx, cy, x, y)
        c.setFillColor(DARK_CARD)
        c.setStrokeColor(HexColor("#343641"))
        c.roundRect(x - 34, y - 14, 68, 28, 7, fill=1, stroke=1)
        c.setFillColor(PAPER)
        c.setFont(FONT_UI, 7.5)
        c.drawCentredString(x, y - 2, name)

    c.setFillColor(HexColor("#D7D0C8"))
    c.setFont(FONT_UI, 8.5)
    c.drawString(M, 78, "24 pages / field guide / printable worksheets / reusable prompts")
    c.drawString(M, 61, "BuildOS / build-os.com")


def page_start_here(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Start here: you are not blocked, you are cold-starting")
    text_block(
        c,
        "Most writers do not sit down to a blank page. They sit down to a cold manuscript: a project whose characters, sources, decisions, and open threads cooled off while life happened.",
        M,
        y,
        500,
        size=11.3,
        leading=16.2,
    )
    y -= 74
    round_rect(c, M, y - 142, COL2_W, 142, DARK, DARK, 10)
    label(c, "The old diagnosis", M + 18, y - 30, AMBER)
    c.setFillColor(PAPER)
    c.setFont(FONT_DISPLAY, 22)
    c.drawString(M + 18, y - 62, "Writer's block")
    text_block(c, "Try harder. Find motivation. Open another tool. Generate ideas until something sticks.", M + 18, y - 88, 214, size=9.5, leading=13, color=HexColor("#D7D0C8"))

    round_rect(c, COL2_X2, y - 142, COL2_W, 142, CARD, AMBER, 10, sw=1.2)
    label(c, "The better diagnosis", COL2_X2 + 18, y - 30)
    c.setFillColor(INK)
    c.setFont(FONT_DISPLAY, 22)
    c.drawString(COL2_X2 + 18, y - 62, "Re-entry tax")
    text_block(c, "The book is scattered, so every session begins with archaeology. The fix is manuscript memory, not shame.", COL2_X2 + 18, y - 88, 214, size=9.5, leading=13)

    y -= 186
    label(c, "Use this guide like a field manual", M, y)
    y -= 24
    bullet_list(
        c,
        [
            "Do not rebuild your whole writing life. Build one reliable Manuscript Home for one active project.",
            "Measure organization by one metric: can you resume in five minutes?",
            "Let AI help as a librarian, continuity clerk, and handoff assistant. The words stay yours.",
            "Keep this PDF open during setup, then print the quick reference and worksheets.",
        ],
        M,
        y,
        500,
    )
    footer(c, page)


def page_diagnostic(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "The 15-minute diagnostic: where your thinking leaks")
    text_block(c, "Check every leak that costs you writing time. Your first system should solve the top two, not everything at once.", M, y, 505, size=11, leading=15.6)
    y -= 58
    leaks = [
        ("The notes graveyard", "Useful fragments disappear into five apps and never resurface."),
        ("Research misses the page", "The quote, passage, or source is somewhere, but finding it costs too much."),
        ("Losing the thread", "A week away forces you to reread instead of write."),
        ("Continuity drift", "Characters, timeline, locations, and rules quietly contradict themselves."),
        ("Feedback chaos", "Editor, beta reader, and writing-group notes arrive in separate places."),
        ("The blank page", "The page looks empty because the material around it is scattered."),
    ]
    for i, (name, desc) in enumerate(leaks, 1):
        row_h = 56
        x = M if i % 2 else COL2_X2
        yy = y - ((i - 1) // 2) * (row_h + 14)
        round_rect(c, x, yy - row_h, COL2_W, row_h, CARD, BORDER, 7)
        draw_checkbox(c, x + 13, yy - 17, 11, AMBER)
        c.setFillColor(INK)
        c.setFont(FONT_UI, 10.5)
        c.drawString(x + 32, yy - 16, name)
        text_block(c, desc, x + 32, yy - 33, 200, size=8.5, leading=10.7, max_lines=2)

    y -= 244
    round_rect(c, M, y - 156, CONTENT_W, 156, MUTED, BORDER, 8)
    label(c, "Write your top two leaks", M + 18, y - 26)
    for idx in [1, 2]:
        line_y = y - 58 - (idx - 1) * 48
        c.setFillColor(AMBER)
        c.circle(M + 25, line_y + 7, 9, fill=1, stroke=0)
        c.setFillColor(PAPER)
        c.setFont(FONT_UI, 8.5)
        c.drawCentredString(M + 25, line_y + 4, str(idx))
        draw_rule(c, M + 45, line_y, W - M - (M + 45), BORDER, 1)
        c.setFillColor(INK_FAINT)
        c.setFont(FONT_UI, 7.5)
        c.drawString(M + 45, line_y + 10, "Leak")
        c.drawString(M + 312, line_y + 10, "What it costs you")
        c.line(M + 300, line_y - 2, M + 300, line_y + 23)
    text_block(c, "Rule: solve the leak that blocks re-entry first. Momentum returns when the book can tell you where you were.", M + 18, y - 133, 470, size=9.8, leading=13)
    footer(c, page)


def page_flow(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "The full flow at a glance")
    text_block(c, "This is the operating loop. AI sits beside it as an assist layer; the writer still owns the compass, the choices, and the sentences.", M, y, 500, size=11, leading=15.6)
    steps = [
        ("00", "Orient", "Set the promise, reader change, voice, and finish line."),
        ("01", "Capture", "Catch live material in one frictionless inbox."),
        ("02", "Sort", "Keep survivors and move them by use."),
        ("03", "Remember", "Update decisions, threads, cast, sources, and timeline."),
        ("04", "Stage", "Build the smallest useful packet for the next job."),
        ("05", "Draft", "Write forward from staged material. Use TK and keep moving."),
        ("06", "Revise", "Run one focused editorial pass at a time."),
        ("07", "Close out", "Record what changed and leave an exact next move."),
    ]
    top = 590
    for i, (num, name, body) in enumerate(steps):
        col = i % 4
        row = i // 4
        x = col4_x(col)
        yy = top - row * 160
        round_rect(c, x, yy - 128, COL4_W, 128, CARD, BORDER, 8)
        c.setFillColor(AMBER)
        c.circle(x + 22, yy - 24, 13, fill=1, stroke=0)
        c.setFillColor(PAPER)
        c.setFont(FONT_UI, 7.6)
        c.drawCentredString(x + 22, yy - 27, num)
        c.setFillColor(INK)
        c.setFont(FONT_DISPLAY, 15)
        c.drawString(x + 41, yy - 29, name)
        text_block(c, body, x + 14, yy - 58, COL4_W - 28, size=8.2, leading=11.1, max_lines=5)
        if col < 3:
            c.setStrokeColor(AMBER)
            c.setLineWidth(1)
            x2 = x + COL4_W
            x3 = x + COL4_W + COL4_GAP
            c.line(x2, yy - 64, x3, yy - 64)
            c.line(x3 - 4, yy - 60, x3, yy - 64)
            c.line(x3 - 4, yy - 68, x3, yy - 64)

    round_rect(c, M, 88, CONTENT_W, 100, DARK, DARK, 8)
    label(c, "AI assist layer", M + 18, 163, AMBER)
    c.setFillColor(PAPER)
    c.setFont(FONT_DISPLAY, 20)
    c.drawString(M + 18, 132, "Memory. Diagnosis. Handoff.")
    text_block(c, "Use AI where it helps you retrieve, compare, question, and prepare. Keep authorship, judgment, and final verification human.", M + 282, 150, 220, size=9.4, leading=12.8, color=HexColor("#D7D0C8"))
    footer(c, page)


def page_compass(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Step 0: set the book compass before you accelerate")
    text_block(c, "A faster workflow amplifies whatever it is pointed at. Define the book before you optimize the making of it.", M, y, 505, size=11, leading=15.6)
    y -= 66
    fields = [
        ("Promise", "What will this book deliver?"),
        ("Reader change", "What is different after reading?"),
        ("Central question", "What tension keeps the book alive?"),
        ("Voice contract", "What must the prose sound and feel like?"),
        ("Non-negotiables", "What will you not flatten, fake, or outsource?"),
        ("Finish line", "What evidence will tell you this draft is done?"),
    ]
    for i, (name, helper) in enumerate(fields):
        x = M if i % 2 == 0 else COL2_X2
        yy = y - (i // 2) * 94
        round_rect(c, x, yy - 76, COL2_W, 76, CARD, BORDER, 7)
        label(c, f"0{i + 1}", x + 14, yy - 22)
        c.setFillColor(INK)
        c.setFont(FONT_UI, 10.5)
        c.drawString(x + 42, yy - 22, name)
        text_block(c, helper, x + 14, yy - 43, COL2_W - 28, size=8.5, leading=11, color=INK_FAINT, max_lines=2)
        draw_rule(c, x + 14, yy - 64, COL2_W - 28)

    y -= 316
    round_rect(c, M, y - 142, CONTENT_W, 142, DARK, DARK, 8)
    label(c, "Write the one-line promise", M + 18, y - 28, AMBER)
    c.setFillColor(PAPER)
    c.setFont(FONT_BODY, 11)
    c.drawString(M + 18, y - 58, "This book helps __________________________ move from __________________________")
    c.drawString(M + 18, y - 85, "to __________________________ by showing / proving / revealing __________________.")
    c.setFillColor(HexColor("#D7D0C8"))
    c.setFont(FONT_UI, 8.4)
    c.drawString(M + 18, y - 116, "Keep this sentence visible. Every scene, section, source, and AI request should serve it.")
    footer(c, page)


def page_manuscript_home(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Build a Manuscript Home")
    text_block(c, "A Manuscript Home is the place where the book remembers itself. It is not another folder. It is the current state of the work, kept warm between sessions.", M, y, 505, size=11, leading=15.6)
    cx, cy = W / 2, 396
    c.setFillColor(DARK)
    c.setStrokeColor(DARK)
    c.circle(cx, cy, 54, fill=1, stroke=0)
    c.setFillColor(PAPER)
    c.setFont(FONT_DISPLAY, 17)
    c.drawCentredString(cx, cy + 8, "Manuscript")
    c.drawCentredString(cx, cy - 12, "Home")
    nodes = [
        ("Last session", -176, 115, "What changed? Where did you stop?"),
        ("Open threads", 0, 145, "Unresolved questions, promises, mysteries, arguments."),
        ("Next-up queue", 176, 115, "Scenes or sections staged to write without re-planning."),
        ("Story bible", -176, -90, "Cast, settings, timeline, terms, rules."),
        ("Research bank", 0, -136, "Sources sorted by use, not by where you found them."),
        ("Canonical draft", 176, -90, "One authoritative manuscript plus dated snapshots."),
    ]
    for name, dx, dy, body in nodes:
        x, yy = cx + dx, cy + dy
        c.setStrokeColor(AMBER)
        c.setLineWidth(0.8)
        c.line(cx, cy, x, yy)
        round_rect(c, x - 72, yy - 41, 144, 82, CARD, BORDER, 8)
        c.setFillColor(AMBER)
        c.roundRect(x - 58, yy + 24, 24, 5, 2.5, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont(FONT_UI, 10.5)
        c.drawString(x - 58, yy + 5, name)
        text_block(c, body, x - 58, yy - 13, 116, size=7.9, leading=10.2, max_lines=3)

    round_rect(c, M, 76, CONTENT_W, 74, AMBER_PALE, AMBER, 8, sw=1)
    label(c, "Definition", M + 16, 126)
    text_block(c, "One canonical draft. One project brain. Dated snapshots before major changes. Organized means future-you knows what is current.", M + 16, 107, 488, size=10.1, leading=13.8)
    footer(c, page)


def page_capture(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Step 1: capture frictionlessly into one place")
    text_block(c, "Capture should be cheaper than forgetting. The inbox is allowed to be ugly. Its only job is to catch thoughts before they cool.", M, y, 505, size=11, leading=15.6)
    y -= 72
    card_text(c, col3_x(0), y, COL3_W, 170, "Rule", "One inbox", "Voice memo, phone note, paper card, or BuildOS brain dump. Pick one default landing zone for the active manuscript.")
    card_text(c, col3_x(1), y, COL3_W, 170, "Do not", "Sort while capturing", "No tags. No folders. No naming ceremony. Capture first, decide later.")
    card_text(c, col3_x(2), y, COL3_W, 170, "Minimum", "Capture the edge", "A phrase, a question, a contradiction, a line of dialogue, or the scene you realized has to exist.")
    y -= 220
    label(c, "Capture prompts", M, y)
    y -= 24
    prompts = [
        "Thing I might forget...",
        "Belongs near...",
        "Question to keep alive...",
        "Reader needs to understand...",
        "Do not lose this source...",
    ]
    for prompt in prompts:
        draw_checkbox(c, M, y, 9, AMBER)
        c.setFillColor(INK)
        c.setFont(FONT_UI, 9.6)
        c.drawString(M + 16, y - 7, prompt)
        draw_rule(c, M + 230, y - 6, CONTENT_W - 230, BORDER, 0.6)
        y -= 32
    round_rect(c, M, 78, CONTENT_W, 72, MUTED, BORDER, 8)
    label(c, "The capture standard", M + 16, 128)
    text_block(c, "If future-you can understand why the note mattered, it is enough. Capture does not have to be elegant.", M + 16, 109, 490, size=10, leading=13.5)
    footer(c, page)


def page_sort(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Step 2: sort once, deliberately, and later")
    text_block(c, "Do not process every note. Let the inbox cool. Survivors are the notes that still pull on you after time has passed.", M, y, 505, size=11, leading=15.6)
    y -= 70
    round_rect(c, M, y - 182, COL2_W, 182, CARD, BORDER, 8)
    label(c, "The survivor test", M + 16, y - 28)
    c.setFillColor(INK)
    c.setFont(FONT_DISPLAY, 19)
    c.drawString(M + 16, y - 58, "Keep it only if...")
    bullet_list(
        c,
        [
            "It changes a scene, claim, character, or decision.",
            "It answers an open question.",
            "It creates useful tension with something already in the book.",
            "It is source evidence you can actually use.",
        ],
        M + 16,
        y - 88,
        214,
        size=8.9,
        leading=12,
    )
    round_rect(c, COL2_X2, y - 182, COL2_W, 182, CARD, BORDER, 8)
    label(c, "Theme beats source", COL2_X2 + 16, y - 28)
    c.setFillColor(INK)
    c.setFont(FONT_DISPLAY, 19)
    c.drawString(COL2_X2 + 16, y - 58, "Move it by use")
    text_block(c, "A source folder says where the note came from. A theme bucket says where it can help the draft.", COL2_X2 + 16, y - 86, 214, size=9.5, leading=13)
    pill(c, "character", COL2_X2 + 16, y - 134, BLUE, HexColor("#E4EEF3"))
    pill(c, "timeline", COL2_X2 + 101, y - 134, GREEN, HexColor("#E0F0E9"))
    pill(c, "argument", COL2_X2 + 176, y - 134, AMBER, AMBER_PALE)
    pill(c, "scene", COL2_X2 + 16, y - 160, AMBER_DARK, HexColor("#F4DED1"))
    pill(c, "reader question", COL2_X2 + 82, y - 160, BLUE, HexColor("#E4EEF3"))

    y -= 238
    label(c, "Sort worksheet", M, y)
    y -= 26
    headers = ["Inbox item", "Use", "Destination", "Next action"]
    xs = [M, M + 150, M + 274, M + 402]
    widths = [142, 112, 116, 138]
    c.setFont(FONT_UI, 7.6)
    c.setFillColor(INK_FAINT)
    for h, x in zip(headers, xs):
        c.drawString(x, y, h.upper())
    y -= 8
    for _ in range(6):
        draw_rule(c, M, y, CONTENT_W)
        for x in xs[1:]:
            c.line(x - 8, y - 24, x - 8, y + 4)
        y -= 30
    footer(c, page)


def page_project_brain(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Step 3: keep one project brain")
    text_block(c, "The project brain stores decisions, not just material. This is the difference between a pile of notes and a book that remembers what it has become.", M, y, 505, size=11, leading=15.6)
    y -= 64
    sections = [
        ("Premise and promise", "What this book is trying to give the reader."),
        ("Current draft state", "Where the manuscript stands today."),
        ("Decisions made", "Names, timeline choices, cuts, POV rules, argument rulings."),
        ("Open loops", "Questions the book has not resolved yet."),
        ("Continuity ledger", "Names, dates, places, character facts, rules."),
        ("Handoff packets", "What an editor, beta reader, or AI tool needs to know."),
    ]
    for i, (name, body) in enumerate(sections):
        x = M if i % 2 == 0 else COL2_X2
        yy = y - (i // 2) * 92
        round_rect(c, x, yy - 74, COL2_W, 74, CARD, BORDER, 7)
        c.setFillColor(AMBER)
        c.setFont(FONT_UI, 8.8)
        c.drawString(x + 14, yy - 24, f"{i + 1:02d}")
        c.setFillColor(INK)
        c.setFont(FONT_UI, 10.5)
        c.drawString(x + 42, yy - 24, name)
        text_block(c, body, x + 42, yy - 43, 188, size=8.5, leading=10.8, max_lines=2)
    y -= 314
    round_rect(c, M, y - 104, CONTENT_W, 104, AMBER_PALE, AMBER, 8)
    label(c, "Weekly project brain review", M + 16, y - 28)
    text_block(c, "Ask: What did the book learn this week? What decision should never have to be made again? What thread must be visible next time I sit down?", M + 16, y - 50, 488, size=10.2, leading=14)
    footer(c, page)


def page_ai_routing(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Step 4: stage the next job with curated context")
    text_block(c, "A staged packet helps you, an editor, or an AI tool do one job without reconstructing the whole book. Curated context beats raw context.", M, y, 505, size=11, leading=15.6)
    y -= 68
    round_rect(c, M, y - 198, CONTENT_W, 198, CARD, BORDER, 8)
    label(c, "Context packet recipe", M + 16, y - 28)
    items = [
        ("Job", "What you want the tool to do."),
        ("Slice", "The specific scene, chapter, source batch, or feedback group."),
        ("Memory", "Relevant decisions, style rules, continuity facts, and open loops."),
        ("Guardrails", "What must remain yours and what claims need verification."),
        ("Output", "The format you need back: checklist, questions, summary, pass plan."),
    ]
    yy = y - 60
    for i, (name, body) in enumerate(items, 1):
        c.setFillColor(AMBER)
        c.circle(M + 31, yy + 5, 10, fill=1, stroke=0)
        c.setFillColor(PAPER)
        c.setFont(FONT_UI, 7.8)
        c.drawCentredString(M + 31, yy + 2, str(i))
        c.setFillColor(INK)
        c.setFont(FONT_UI, 10.3)
        c.drawString(M + 52, yy + 1, name)
        text_block(c, body, M + 122, yy + 1, 360, size=8.9, leading=11.8, max_lines=1)
        yy -= 27

    y -= 244
    card_text(c, col3_x(0), y, COL3_W, 142, "Useful role", "Librarian", "Find the exact note, source, or decision that matters for this scene or claim.", heading_size=12.5)
    card_text(c, col3_x(1), y, COL3_W, 142, "Useful role", "Continuity clerk", "Scan for contradictions in timeline, names, rules, promises, and unresolved threads.", heading_size=12.5)
    card_text(c, col3_x(2), y, COL3_W, 142, "Useful role", "Handoff assistant", "Prepare packets for editors, beta readers, research passes, and revision planning.", heading_size=12.5)
    footer(c, page)


def page_ai_task_map(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Use the AI task map before you prompt")
    text_block(c, "The question is not whether AI is good or bad. The question is which cognitive job you are assigning, what can go wrong, and who owns the final judgment.", M, y, 505, size=10.8, leading=15.2)
    y -= 70
    columns = [
        (GREEN, HexColor("#E2F0E8"), "GREEN", "Delegate the mechanics", [
            "Summarize your own notes",
            "Retrieve relevant project memory",
            "Sort feedback into passes",
            "Compare versions or spot contradictions",
            "Turn closeouts into re-entry briefs",
        ]),
        (GOLD, HexColor("#F5E9D1"), "AMBER", "Supervise the thinking", [
            "Generate questions or alternatives",
            "Suggest structural diagnostics",
            "Discover possible research leads",
            "Stress-test an argument or scene",
            "Draft non-manuscript checklists",
        ]),
        (RED, HexColor("#F5DFDA"), "RED", "Keep the authority", [
            "Your manuscript voice and final prose",
            "Facts, quotes, citations, and attribution",
            "Sensitive or unpublished material",
            "Ethical, legal, or reputational judgment",
            "The final decision about the book",
        ]),
    ]
    for i, (accent, fill, status, heading, items) in enumerate(columns):
        x = col3_x(i)
        round_rect(c, x, y - 242, COL3_W, 242, fill, accent, 8, sw=1)
        c.setFillColor(accent)
        c.rect(x, y - 8, COL3_W, 8, fill=1, stroke=0)
        label(c, status, x + 14, y - 30, accent)
        c.setFillColor(INK)
        c.setFont(FONT_DISPLAY, 16)
        hy = y - 56
        for line in wrap(heading, FONT_DISPLAY, 16, COL3_W - 28):
            c.drawString(x + 14, hy, line)
            hy -= 18
        bullet_list(c, items, x + 14, hy - 8, COL3_W - 28, size=8.1, leading=10.7)

    y -= 288
    round_rect(c, M, y - 164, CONTENT_W, 164, DARK, DARK, 8)
    label(c, "Four-question gate", M + 18, y - 28, AMBER)
    gates = [
        "Could this expose private, licensed, or unpublished material?",
        "Would I know if the output invented a fact or citation?",
        "Does this job require my taste, voice, or moral judgment?",
        "Can I describe how I will verify the result before using it?",
    ]
    for i, gate in enumerate(gates):
        x = M + 18 + (i % 2) * 254
        yy = y - 58 - (i // 2) * 50
        draw_checkbox(c, x, yy, 10, AMBER)
        text_block(c, gate, x + 18, yy - 2, 218, size=8.7, leading=11.6, color=HexColor("#D7D0C8"), max_lines=2)
    c.setFillColor(PAPER)
    c.setFont(FONT_UI, 8.8)
    c.drawString(M + 18, y - 143, "If the risk is unclear, reduce the packet, change the job, or keep it human.")
    footer(c, page)


def page_guardrails(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Protect the work: voice, privacy, provenance")
    text_block(c, "Speed is useful only if the work remains recognizably yours, the material is handled deliberately, and every published claim can be traced.", M, y, 505, size=10.8, leading=15.2)
    y -= 68
    card_text(c, col3_x(0), y, COL3_W, 184, "Voice", "Build a fingerprint", "Choose five pages that sound most like you. Name the rhythm, diction, distance, humor, and moves you refuse. Use it to detect drift - not to imitate yourself mechanically.", fill=HexColor("#E4EEF3"), accent=BLUE, heading_size=12.5)
    card_text(c, col3_x(1), y, COL3_W, 184, "Privacy", "Minimize the packet", "Before uploading unpublished work, interviews, client material, or personal data, understand the tool's settings and terms. Share only what the job requires.", fill=HexColor("#E2F0E8"), accent=GREEN, heading_size=12.5)
    card_text(c, col3_x(2), y, COL3_W, 184, "Provenance", "Trace every claim", "AI output is not a source. Open the original, confirm the exact support, record the location, and cite the source you actually checked.", fill=HexColor("#F5E9D1"), accent=GOLD, heading_size=12.5)

    y -= 230
    round_rect(c, M, y - 222, CONTENT_W, 222, CARD, BORDER, 8)
    label(c, "Preflight before anything leaves your desk", M + 16, y - 28)
    checks = [
        "The final prose sounds like me, not a generic average.",
        "Every factual claim has an original source I opened.",
        "Every quotation matches the source exactly.",
        "No sensitive material was shared beyond what I intended.",
        "AI suggestions were treated as options, not authority.",
        "I can explain the editorial decisions in the final work.",
    ]
    for i, item in enumerate(checks):
        x = M + 18 + (i % 2) * 252
        yy = y - 66 - (i // 2) * 45
        draw_checkbox(c, x, yy, 10, AMBER)
        text_block(c, item, x + 19, yy - 1, 215, size=8.8, leading=11.7, max_lines=2)
    round_rect(c, M + 16, y - 214, CONTENT_W - 32, 42, AMBER_PALE, AMBER, 6)
    text_block(c, "Authorship test: remove the AI output. Is the central insight, structure, and language still recognizably yours?", M + 30, y - 189, CONTENT_W - 60, size=9.4, leading=12.8)
    footer(c, page)


def page_draft(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Step 5: draft fast from staged material")
    text_block(c, "Drafting is not the time to sort, research, or negotiate the book's identity. Drafting is assembly from material you already staged.", M, y, 505, size=11, leading=15.6)
    y -= 66
    round_rect(c, M, y - 164, COL2_W, 164, DARK, DARK, 8)
    label(c, "The draft sprint", M + 16, y - 28, AMBER)
    c.setFillColor(PAPER)
    c.setFont(FONT_DISPLAY, 20)
    c.drawString(M + 16, y - 58, "45 minutes")
    text_block(c, "Open one scene or section packet. Write forward. When a fact is missing, type TK. When a better idea arrives, capture it in the inbox, then return.", M + 16, y - 88, 214, size=9.5, leading=13, color=HexColor("#D7D0C8"))

    round_rect(c, COL2_X2, y - 164, COL2_W, 164, CARD, BORDER, 8)
    label(c, "Scene packet", COL2_X2 + 16, y - 28)
    bullet_list(
        c,
        [
            "Purpose of scene / section",
            "What changed before it",
            "What must change inside it",
            "Material to use",
            "Continuity facts",
            "Exit hook / next beat",
        ],
        COL2_X2 + 16,
        y - 52,
        214,
        size=8.8,
        leading=11.6,
    )
    y -= 222
    label(c, "Build your next three packets", M, y)
    y -= 24
    for i in range(3):
        yy = y - i * 58
        c.setFillColor(AMBER)
        c.circle(M + 12, yy - 4, 10, fill=1, stroke=0)
        c.setFillColor(PAPER)
        c.setFont(FONT_UI, 8)
        c.drawCentredString(M + 12, yy - 7, str(i + 1))
        c.setFillColor(INK_FAINT)
        c.setFont(FONT_UI, 7.4)
        c.drawString(M + 32, yy + 8, "Scene / section")
        draw_rule(c, M + 32, yy - 6, 170)
        c.drawString(M + 220, yy + 8, "Staged material")
        draw_rule(c, M + 220, yy - 6, 155)
        c.drawString(M + 390, yy + 8, "Exit beat")
        draw_rule(c, M + 390, yy - 6, 132)
        draw_rule(c, M + 32, yy - 30, 490)
    round_rect(c, M, 76, CONTENT_W, 72, MUTED, BORDER, 8)
    label(c, "Use searchable placeholders", M + 16, 126)
    c.setFillColor(INK)
    c.setFont(FONT_MONO, 8.4)
    c.drawString(M + 16, 103, "TK-FACT [missing fact]")
    c.drawString(M + 182, 103, "TK-SOURCE [needed evidence]")
    c.drawString(M + 368, 103, "TK-DECISION [choice later]")
    text_block(c, "Keep drafting now; search every TK in one cleanup pass later.", M + 16, 87, 480, size=8.3, leading=10.8, color=INK_FAINT, max_lines=1)
    footer(c, page)


def page_revise(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Step 6: revise with distance")
    text_block(c, "Revision gets chaotic when every problem is handled at once. Build a runway of passes. Each pass has one job.", M, y, 505, size=11, leading=15.6)
    y -= 72
    passes = [
        ("1", "Structure", "Does the book move in the right order?"),
        ("2", "Arc", "Does the person, argument, or reader state change?"),
        ("3", "Thread", "Are promises opened, carried, and resolved?"),
        ("4", "Continuity", "Do facts, timeline, names, and rules hold?"),
        ("5", "Scene", "Does each scene earn its space?"),
        ("6", "Line", "Is the prose clear, alive, and yours?"),
        ("7", "Proof", "Final correctness after big changes stop."),
    ]
    x0, y0 = M, y - 24
    for i, (num, name, body) in enumerate(passes):
        x = x0 + i * 73
        c.setFillColor(AMBER if i < 4 else HexColor("#E9D8C8"))
        c.roundRect(x, y0 - 22, 60, 32, 7, fill=1, stroke=0)
        c.setFillColor(PAPER if i < 4 else INK_SOFT)
        c.setFont(FONT_UI, 8)
        c.drawCentredString(x + 30, y0 - 3, name)
        if i < len(passes) - 1:
            c.setStrokeColor(AMBER)
            c.setLineWidth(0.8)
            c.line(x + 61, y0 - 6, x + 72, y0 - 6)
    y -= 130
    for i, (num, name, body) in enumerate(passes):
        yy = y - i * 45
        c.setFillColor(AMBER)
        c.circle(M + 12, yy, 10, fill=1, stroke=0)
        c.setFillColor(PAPER)
        c.setFont(FONT_UI, 8)
        c.drawCentredString(M + 12, yy - 3, num)
        c.setFillColor(INK)
        c.setFont(FONT_UI, 10.4)
        c.drawString(M + 32, yy - 1, name)
        text_block(c, body, M + 126, yy - 1, 380, size=8.9, leading=11.7, max_lines=1)
        draw_rule(c, M + 32, yy - 21, 490, BORDER, 0.55)
    round_rect(c, M, 60, CONTENT_W, 54, AMBER_PALE, AMBER, 8)
    text_block(c, "Feedback is signal, not a verdict. Sort it by pass before you decide what becomes the book.", M + 16, 93, 486, size=10.2, leading=13.8)
    footer(c, page)


def page_story_world(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "For fiction: keep the story world warm")
    text_block(c, "World-building is useful only when it changes what characters can do, know, want, or risk. Let the story bible accrete from scenes and consequences.", M, y, 505, size=11, leading=15.6)
    y -= 68
    card_text(c, col3_x(0), y, COL3_W, 160, "People", "Character state", "Wants, fears, secrets, loyalties, knowledge, leverage, voice, and the last thing that changed them.", heading_size=12.5)
    card_text(c, col3_x(1), y, COL3_W, 160, "World", "Place and systems", "Geography, resources, customs, institutions, technology, power, sensory anchors, and hard limits.", heading_size=12.5)
    card_text(c, col3_x(2), y, COL3_W, 160, "Causality", "Time and knowledge", "When events happen, who knows what, how information travels, and which consequences are now unavoidable.", heading_size=12.5)
    y -= 210
    round_rect(c, M, y - 196, CONTENT_W, 196, CARD, BORDER, 8)
    label(c, "Scene closeout -> story bible", M + 16, y - 26)
    text_block(c, "After drafting a scene, add only what changed. This keeps the bible alive without turning it into a second book.", M + 16, y - 48, 480, size=9.8, leading=13.5)
    rows = [
        "New character fact",
        "New rule, custom, or constraint",
        "Power, resource, or relationship shift",
        "Timeline or knowledge change",
        "Open promise / mystery",
    ]
    yy = y - 82
    for r in rows:
        draw_checkbox(c, M + 18, yy, 9, AMBER)
        c.setFillColor(INK)
        c.setFont(FONT_UI, 9)
        c.drawString(M + 34, yy - 7, r)
        draw_rule(c, M + 170, yy - 6, 330)
        yy -= 22
    footer(c, page)


def page_nonfiction(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "For nonfiction: keep the argument warm")
    text_block(c, "The nonfiction version of continuity is claim discipline. Keep sources, claims, examples, and reader objections attached to the part of the draft where they matter.", M, y, 505, size=11, leading=15.6)
    y -= 70
    columns = [
        ("Claim bank", "Each claim needs evidence, a counterpoint, and a location in the draft."),
        ("Source ledger", "Track source, useful passage, reliability, and where it supports the argument."),
        ("Example shelf", "Stories, cases, metaphors, and analogies sorted by use."),
        ("Reader questions", "The objections, confusions, and missing context your reader will bring."),
    ]
    for i, (name, body) in enumerate(columns):
        x = M if i % 2 == 0 else COL2_X2
        yy = y - (i // 2) * 118
        card_text(c, x, yy, COL2_W, 98, f"0{i + 1}", name, body, heading_size=12.8)
    y -= 286
    label(c, "Research-to-draft check", M, y)
    y -= 24
    for prompt in [
        "Changes the argument by...",
        "Belongs near paragraph...",
        "Supports or challenges claim...",
        "Answers reader objection...",
    ]:
        draw_checkbox(c, M, y, 9, AMBER)
        c.setFillColor(INK)
        c.setFont(FONT_UI, 9.3)
        c.drawString(M + 16, y - 7, prompt)
        draw_rule(c, M + 260, y - 6, CONTENT_W - 260)
        y -= 34
    round_rect(c, M, 56, CONTENT_W, 70, DARK, DARK, 8)
    label(c, "Chapter test", M + 16, 102, AMBER)
    c.setFillColor(PAPER)
    c.setFont(FONT_DISPLAY, 17)
    c.drawString(M + 16, 78, "What changes for the reader here?")
    text_block(c, "Name the shift in what they know, believe, feel, or can do. If nothing changes, combine, move, or cut the chapter.", M + 250, 87, 252, size=8.5, leading=11.3, color=HexColor("#D7D0C8"), max_lines=3)
    footer(c, page)


def page_research_integrity(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "For researched work: build a verification chain")
    text_block(c, "Discovery is not verification. A research workflow is complete only when a claim can travel from manuscript sentence back to exact support in an original source.", M, y, 505, size=10.8, leading=15.2)
    y -= 70
    steps = [
        ("01", "Discover"),
        ("02", "Open"),
        ("03", "Confirm"),
        ("04", "Record"),
        ("05", "Place"),
        ("06", "Audit"),
    ]
    step_w = (CONTENT_W - 5 * 10) / 6
    for i, (num, name) in enumerate(steps):
        x = M + i * (step_w + 10)
        round_rect(c, x, y - 68, step_w, 68, CARD, BORDER, 7)
        c.setFillColor(AMBER)
        c.circle(x + step_w / 2, y - 22, 11, fill=1, stroke=0)
        c.setFillColor(PAPER)
        c.setFont(FONT_UI, 7.2)
        c.drawCentredString(x + step_w / 2, y - 25, num)
        c.setFillColor(INK)
        c.setFont(FONT_UI, 8.3)
        c.drawCentredString(x + step_w / 2, y - 49, name)
        if i < 5:
            c.setStrokeColor(AMBER)
            c.line(x + step_w, y - 34, x + step_w + 10, y - 34)

    y -= 112
    label(c, "Claim ledger", M, y)
    y -= 22
    headers = ["Claim", "Source", "Exact support", "Locator", "Checked", "Draft"]
    xs = [M, M + 96, M + 190, M + 310, M + 384, M + 444]
    c.setFillColor(INK_FAINT)
    c.setFont(FONT_UI, 7)
    for heading, x in zip(headers, xs):
        c.drawString(x, y, heading.upper())
    y -= 10
    for _ in range(6):
        draw_rule(c, M, y, CONTENT_W)
        for x in xs[1:]:
            c.line(x - 7, y - 34, x - 7, y + 4)
        y -= 40

    round_rect(c, M, 74, CONTENT_W, 88, DARK, DARK, 8)
    label(c, "Status rule", M + 16, 137, AMBER)
    c.setFillColor(PAPER)
    c.setFont(FONT_UI, 9.2)
    c.drawString(M + 16, 112, "VERIFIED")
    c.drawString(M + 190, 112, "UNRESOLVED")
    c.drawString(M + 366, 112, "CUT")
    text_block(c, "Original opened and support logged.", M + 16, 95, 150, size=7.9, leading=10.2, color=HexColor("#D7D0C8"), max_lines=2)
    text_block(c, "Mark TK and keep it out of final copy.", M + 190, 95, 150, size=7.9, leading=10.2, color=HexColor("#D7D0C8"), max_lines=2)
    text_block(c, "No support, no claim - however elegant.", M + 366, 95, 138, size=7.9, leading=10.2, color=HexColor("#D7D0C8"), max_lines=2)
    footer(c, page)


def page_reentry(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Worksheet: the five-minute re-entry brief")
    text_block(c, "Fill this before every writing session. If you cannot fill it, your Manuscript Home needs one more closeout, not another app.", M, y, 505, size=10.6, leading=15)
    y -= 52
    fields = [
        ("Where I stopped", 58),
        ("What changed last session", 58),
        ("The next scene / section to write", 58),
        ("Relevant memory I need loaded", 74),
        ("Open question I should not solve mid-draft", 58),
        ("My exact next move", 58),
    ]
    for name, h in fields:
        round_rect(c, M, y - h, CONTENT_W, h, CARD, BORDER, 7)
        label(c, name, M + 14, y - 20, INK_FAINT)
        draw_rule(c, M + 14, y - 36, CONTENT_W - 28)
        if h > 62:
            draw_rule(c, M + 14, y - 58, CONTENT_W - 28)
        y -= h + 12
    footer(c, page)


def page_closeout(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Worksheet: the session closeout")
    text_block(c, "The closeout is how the story stays warm. Spend three minutes here before you stop, especially if the session went well.", M, y, 505, size=10.8, leading=15.2)
    y -= 58
    prompts = [
        ("I stopped at...", "Leave tomorrow a door handle."),
        ("The most important thing I learned was...", "Decision, insight, source, character fact, or scene problem."),
        ("Do not forget...", "The fragile thought that will vanish overnight."),
        ("Next time, start by...", "One concrete action, not a mood."),
        ("Add to project memory...", "Continuity, source, open thread, or revision task."),
    ]
    for name, helper in prompts:
        round_rect(c, M, y - 82, CONTENT_W, 82, CARD, BORDER, 7)
        c.setFillColor(INK)
        c.setFont(FONT_UI, 10.5)
        c.drawString(M + 14, y - 22, name)
        text_block(c, helper, M + 260, y - 22, 245, size=8.2, leading=10.2, color=INK_FAINT, max_lines=1)
        draw_rule(c, M + 14, y - 45, CONTENT_W - 28)
        draw_rule(c, M + 14, y - 66, CONTENT_W - 28)
        y -= 94
    footer(c, page)


def page_feedback(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Worksheet: sort feedback without drowning")
    text_block(c, "Do not revise from raw comments. Aggregate the signal first, then decide the pass it belongs to.", M, y, 505, size=10.8, leading=15.2)
    y -= 58
    headers = ["Feedback signal", "Pattern?", "Pass", "Decision"]
    xs = [M, M + 190, M + 290, M + 386]
    widths = [176, 86, 82, 136]
    c.setFillColor(INK_FAINT)
    c.setFont(FONT_UI, 7.2)
    for h, x in zip(headers, xs):
        c.drawString(x, y, h.upper())
    y -= 10
    for _ in range(10):
        draw_rule(c, M, y, CONTENT_W)
        for x in xs[1:]:
            c.line(x - 8, y - 31, x - 8, y + 4)
        y -= 37
    round_rect(c, M, 60, CONTENT_W, 64, AMBER_PALE, AMBER, 8)
    text_block(c, "Useful pattern test: if two readers are confused in the same neighborhood, believe the confusion. You still choose the fix.", M + 16, 100, 486, size=9.9, leading=13.6)
    footer(c, page)


def page_sprint(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Seven-day setup sprint")
    text_block(c, "Use this if your current system is scattered. Do one small action each day. By day seven, your project has a home and a restart ritual.", M, y, 505, size=10.8, leading=15.2)
    y -= 62
    days = [
        ("Day 1", "Choose one manuscript. Write its promise and finish line."),
        ("Day 2", "Create the Manuscript Home, canonical draft, and dated backup."),
        ("Day 3", "Choose one inbox. Process 20 notes with the survivor test."),
        ("Day 4", "Record current state, decisions, open loops, and continuity."),
        ("Day 5", "Stage three packets. Set your green, amber, and red AI rules."),
        ("Day 6", "Draft from one packet. Finish with a three-minute closeout."),
        ("Day 7", "Re-enter in five minutes, then schedule one revision or verification pass."),
    ]
    for i, (d, task) in enumerate(days):
        x = M + (i % 2) * 270
        yy = y - (i // 2) * 89
        h = 74
        if i == 6:
            x = M
            w = CONTENT_W
        else:
            w = 250
        round_rect(c, x, yy - h, w, h, CARD, BORDER, 7)
        label(c, d, x + 14, yy - 24)
        text_block(c, task, x + 14, yy - 44, w - 28, size=9.1, leading=12.1, max_lines=2)
        draw_checkbox(c, x + w - 25, yy - 19, 11, AMBER)
    footer(c, page)


def page_prompt_cards(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Prompt cards: AI that remembers, not writes")
    text_block(c, "Replace the brackets with the smallest useful packet. Keep the instruction narrow, require evidence, and specify the output format.", M, y, 505, size=10.8, leading=15.2)
    y -= 58
    prompts = [
        ("Librarian", "Using only this context packet, list the notes, sources, or decisions that matter for [scene/section]. Do not write prose. Return missing context as questions."),
        ("Continuity clerk", "Scan this packet for contradictions in timeline, names, locations, promises, or world rules. Return a table: issue, evidence, risk, possible fix."),
        ("Re-entry assistant", "Turn this closeout into a five-minute re-entry brief. Include where I stopped, what changed, what to load, and the exact next move."),
        ("Revision planner", "Sort this feedback into revision passes: structure, arc, thread, continuity, scene, line, proof. Do not rewrite. Give me the next three moves."),
        ("Source auditor", "For each claim in this packet, identify the cited source and exact support provided. Mark anything missing or indirect as UNVERIFIED. Do not invent citations."),
        ("Voice drift detector", "Compare this passage with my voice fingerprint. Flag shifts in rhythm, diction, distance, or stance. Quote the evidence. Diagnose only; do not rewrite."),
    ]
    for i, (name, prompt) in enumerate(prompts):
        x = M if i % 2 == 0 else COL2_X2
        yy = y - (i // 2) * 158
        round_rect(c, x, yy - 142, COL2_W, 142, CARD, BORDER, 8)
        label(c, name, x + 14, yy - 24)
        text_block(c, prompt, x + 14, yy - 47, COL2_W - 28, font=FONT_MONO, size=7.5, leading=10.2, max_lines=8)
    footer(c, page)


def page_quick_ref(c: canvas.Canvas, page: int) -> None:
    y = open_page(c, page, "Printable quick reference")
    text_block(c, "Keep this page near your desk. It is the whole system compressed.", M, y, 505, size=10.8, leading=15.2)
    y -= 56
    quick = [
        ("0. Orient", "Set promise, reader change, voice contract, and finish line."),
        ("1. Capture", "One inbox. No sorting at capture time."),
        ("2. Sort", "Let notes cool. Keep survivors. Move them by use."),
        ("3. Remember", "Update state, decisions, open loops, sources, and continuity."),
        ("4. Stage", "Build the smallest packet that can do the next job."),
        ("5. Draft", "Write from staged material. Type TK. Keep moving."),
        ("6. Revise", "Run one focused pass at a time, with distance."),
        ("7. Close out", "Record what changed and leave an exact next move."),
    ]
    for i, (name, body) in enumerate(quick):
        x = M if i % 2 == 0 else COL2_X2
        yy = y - (i // 2) * 84
        round_rect(c, x, yy - 70, COL2_W, 70, CARD, BORDER, 8)
        c.setFillColor(AMBER)
        c.circle(x + 24, yy - 26, 13, fill=1, stroke=0)
        c.setFillColor(PAPER)
        c.setFont(FONT_UI, 7.6)
        c.drawCentredString(x + 24, yy - 29, str(i))
        c.setFillColor(INK)
        c.setFont(FONT_UI, 10.2)
        c.drawString(x + 45, yy - 22, name)
        text_block(c, body, x + 45, yy - 40, 187, size=8.1, leading=10.6, max_lines=2)
    y -= 358
    round_rect(c, M, y - 108, CONTENT_W, 108, DARK, DARK, 8)
    label(c, "The operating principle", M + 18, y - 28, AMBER)
    c.setFillColor(PAPER)
    c.setFont(FONT_DISPLAY, 22)
    c.drawString(M + 18, y - 59, "Be prolific by losing less.")
    text_block(c, "Slow sort. Fast draft. Verify what matters. Close every session while the book is still warm.", M + 18, y - 82, 480, size=9.5, leading=12.8, color=HexColor("#D7D0C8"))
    footer(c, page)


def page_buildos(c: canvas.Canvas, page: int) -> None:
    draw_background(c, page)
    logo = ROOT / "apps/web/static/buildos-logo-light.png"
    image_fit(c, logo, M, 702, 136, 42)
    label(c, "Where BuildOS fits", M, 662)
    title(c, "A project brain that keeps the book warm", M, 638, 505, 28)
    text_block(
        c,
        "This flow is what BuildOS is built around: talk through messy thinking, and the project becomes structured work with memory. For writers, that means a manuscript home, a re-entry brief, continuity reminders, and context your tools can use without making you paste your whole book into every chat.",
        M,
        558,
        500,
        size=10.8,
        leading=15.4,
    )
    y = 470
    card_text(c, col3_x(0), y, COL3_W, 126, "BuildOS helps", "Capture", "Brain dump rough project state, notes, scene problems, and decisions.")
    card_text(c, col3_x(1), y, COL3_W, 126, "BuildOS helps", "Remember", "Keep project memory connected across tasks, docs, risks, and next moves.")
    card_text(c, col3_x(2), y, COL3_W, 126, "BuildOS helps", "Resume", "Return to the book with the thread already visible.")

    shot = ROOT / "apps/web/static/blogs/buildos-chat.png"
    round_rect(c, M, 118, CONTENT_W, 204, DARK, DARK, 10)
    image_fit(c, shot, M + 12, 132, CONTENT_W - 24, 176)
    c.setFillColor(INK_FAINT)
    c.setFont(FONT_UI, 7.4)
    c.drawString(M, 95, "build-os.com")
    c.setFillColor(AMBER)
    c.roundRect(W - M - 152, 76, 152, 32, 16, fill=1, stroke=0)
    c.setFillColor(PAPER)
    c.setFont(FONT_UI, 9.3)
    c.drawCentredString(W - M - 76, 88, "Try BuildOS free")
    c.linkURL("https://build-os.com/auth/register", (W - M - 152, 76, W - M, 108), relative=0)
    footer(c, page, "The project remembers")


def build() -> None:
    register_fonts()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=letter)
    c.setTitle("The Writer's AI-Age Flow")
    c.setAuthor("BuildOS")
    c.setSubject("A complete guide for writers to keep manuscript memory warm in the AI age.")
    c.setKeywords("BuildOS, writers, manuscript memory, AI writing workflow, project brain")

    pages = [
        lambda cc, p: draw_cover(cc),
        page_start_here,
        page_diagnostic,
        page_flow,
        page_compass,
        page_manuscript_home,
        page_capture,
        page_sort,
        page_project_brain,
        page_ai_routing,
        page_ai_task_map,
        page_guardrails,
        page_draft,
        page_revise,
        page_story_world,
        page_nonfiction,
        page_research_integrity,
        page_reentry,
        page_closeout,
        page_feedback,
        page_sprint,
        page_prompt_cards,
        page_quick_ref,
        page_buildos,
    ]
    for page_num, fn in enumerate(pages, 1):
        fn(c, page_num)
        c.showPage()
    c.save()
    print(OUT)


if __name__ == "__main__":
    build()
