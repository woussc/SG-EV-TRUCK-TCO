#!/usr/bin/env python3
"""Generate the SG EV Truck TCO interview-findings PowerPoint deck.

Scope: interview findings ONLY. This script does not reproduce the separate
TCO model technical presentation (engine architecture, presets, sensitivity
tornado, pricing guardrails).

Source material: field interview notes from the SG-EV-TRUCK-TCO project.
Primary interview is with "Keith" (Goldbell group) across three aspects, plus
four short secondary contacts.

Output: docs/interview-findings.pptx (committed, reproducible).

Run:
    python tools/build_interview_deck.py
"""

from __future__ import annotations

import os

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt

# --- Palette (clean corporate, Singapore EV context) ----------------------
INK = RGBColor(0x1A, 0x2E, 0x35)       # dark slate
TEAL = RGBColor(0x0F, 0x6E, 0x6E)      # primary accent
GREEN = RGBColor(0x2E, 0x7D, 0x32)     # EV/green accent
AMBER = RGBColor(0xB5, 0x6A, 0x00)     # caution accent
GREY = RGBColor(0x55, 0x5F, 0x63)      # secondary text
LIGHT = RGBColor(0xF2, 0xF5, 0xF6)     # panel background
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

EMU_W = Inches(13.333)
EMU_H = Inches(7.5)


def _set_bg(slide, color):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def _text(tf, runs_lines, base_size=16, color=INK, space_after=6):
    """Fill a text frame. runs_lines: list of (text, level, bold, size, color)."""
    tf.word_wrap = True
    first = True
    for text, level, bold, size, col in runs_lines:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.level = level
        p.space_after = Pt(space_after)
        p.space_before = Pt(0)
        run = p.add_run()
        run.text = text
        run.font.size = Pt(size if size else base_size)
        run.font.bold = bold
        run.font.color.rgb = col if col else color
        run.font.name = "Calibri"


def _accent_bar(slide, color=TEAL, top=Inches(0.0)):
    bar = slide.shapes.add_shape(
        1, Inches(0), top, EMU_W, Inches(0.18)
    )
    bar.fill.solid()
    bar.fill.fore_color.rgb = color
    bar.line.fill.background()
    bar.shadow.inherit = False
    return bar


def _header(slide, kicker, title, accent=TEAL):
    _accent_bar(slide, accent, Inches(0.0))
    k = slide.shapes.add_textbox(Inches(0.6), Inches(0.35), Inches(12.1), Inches(0.4))
    _text(k.text_frame, [(kicker.upper(), 0, True, 13, accent)], space_after=0)
    t = slide.shapes.add_textbox(Inches(0.6), Inches(0.72), Inches(12.1), Inches(0.9))
    _text(t.text_frame, [(title, 0, True, 30, INK)], space_after=0)


def _panel(slide, left, top, width, height, fill=LIGHT):
    p = slide.shapes.add_shape(1, left, top, width, height)
    p.fill.solid()
    p.fill.fore_color.rgb = fill
    p.line.color.rgb = RGBColor(0xD8, 0xDE, 0xE0)
    p.line.width = Pt(0.75)
    p.shadow.inherit = False
    return p


def bullets(level0_bold, items):
    """Helper to build a (title bold) + bullet list spec."""
    lines = []
    if level0_bold:
        lines.append((level0_bold, 0, True, 16, TEAL))
    for it in items:
        if isinstance(it, tuple):
            txt, lvl = it
        else:
            txt, lvl = it, 1
        lines.append(("\u2022 " + txt if lvl == 1 else "\u2013 " + txt, lvl, False, 14, INK))
    return lines


# ---------------------------------------------------------------------------
def build():
    prs = Presentation()
    prs.slide_width = EMU_W
    prs.slide_height = EMU_H
    blank = prs.slide_layouts[6]

    # ---- Slide 1: Title ---------------------------------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, INK)
    _accent_bar(s, GREEN, Inches(0.0))
    _accent_bar(s, GREEN, Inches(7.32))
    tb = s.shapes.add_textbox(Inches(0.9), Inches(2.1), Inches(11.5), Inches(2.6))
    _text(tb.text_frame, [
        ("SG EV TRUCK TCO PROJECT", 0, True, 16, GREEN),
        ("Interview Findings", 0, True, 48, WHITE),
        ("Field interviews with commercial-vehicle operators, lessors and workshops in Singapore",
         0, False, 20, RGBColor(0xC8, 0xD2, 0xD5)),
    ], space_after=10)
    tb2 = s.shapes.add_textbox(Inches(0.9), Inches(5.6), Inches(11.5), Inches(1.0))
    _text(tb2.text_frame, [
        ("Primary interview: Keith (Goldbell group)", 0, False, 15, RGBColor(0xA8, 0xB6, 0xBA)),
        ("Secondary contacts: King Auto \u00b7 Cosmopolitan \u00b7 Tritech \u00b7 Hock Wah",
         0, False, 15, RGBColor(0xA8, 0xB6, 0xBA)),
    ], space_after=4)

    # ---- Slide 2: Agenda & interview method ------------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, WHITE)
    _header(s, "How we ran it", "Agenda & interview method")
    # left panel: method
    _panel(s, Inches(0.6), Inches(1.75), Inches(6.0), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(0.85), Inches(1.95), Inches(5.55), Inches(4.8))
    _text(tb.text_frame, [
        ("One-hour session structure", 0, True, 18, TEAL),
        ("\u2022 Open on the nature of the business and the industry \u2013 market overview, SWOT (10\u201315 min)", 1, False, 14, INK),
        ("\u2022 Read whether the contact is technical or customer-oriented (~15 min)", 1, False, 14, INK),
        ("\u2013 If technical: run the numbers (Aspects 2 & 3)", 2, False, 13, GREY),
        ("\u2013 If customer-facing: their POV on why an EV truck was bought or leased (Aspect 1)", 2, False, 13, GREY),
        ("\u2022 Work the three aspects, play by ear (~15 min)", 1, False, 14, INK),
        ("\u2022 Close: confirm how they want to be attributed (~5 min)", 1, False, 14, INK),
        ("\u2022 Screenshot the meeting", 1, False, 14, INK),
    ], space_after=7)
    # right panel: three aspects
    _panel(s, Inches(6.9), Inches(1.75), Inches(5.8), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(7.15), Inches(1.95), Inches(5.35), Inches(4.8))
    _text(tb.text_frame, [
        ("The three aspects", 0, True, 18, TEAL),
        ("1  Purchase economics & the decision to buy", 1, True, 15, INK),
        ("How cost, financing and willingness-to-pay drive the buy/decline decision.", 2, False, 13, GREY),
        ("2  Daily work, vehicle suitability & reliability", 1, True, 15, INK),
        ("Range, durability, depreciation, scrap value and load/access fit.", 2, False, 13, GREY),
        ("3  Charging, site costs & organisational implementation", 1, True, 15, INK),
        ("Installation cost, grid limits, parking, and split ownership of vehicle/driver/premises.", 2, False, 13, GREY),
    ], space_after=9)

    # ---- Slide 3: Primary interview profile ------------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, WHITE)
    _header(s, "Primary interview", "Keith \u2014 Goldbell group", accent=GREEN)
    _panel(s, Inches(0.6), Inches(1.75), Inches(12.1), Inches(2.0))
    tb = s.shapes.add_textbox(Inches(0.85), Inches(1.95), Inches(11.6), Inches(1.7))
    _text(tb.text_frame, [
        ("Background", 0, True, 16, GREEN),
        ("\u2022 20 years in the Goldbell group; a large fleet operator of commercial vehicles.", 1, False, 14, INK),
        ("\u2022 18 years in commercial vehicles \u2014 sales and distribution, and leasing.", 1, False, 14, INK),
        ("\u2022 Current role: automation of forklifts. Some group matters cannot be shared.", 1, False, 14, INK),
    ], space_after=6)
    tb = s.shapes.add_textbox(Inches(0.6), Inches(4.0), Inches(12.1), Inches(2.8))
    _text(tb.text_frame, [
        ("What the conversation covered", 0, True, 16, TEAL),
        ("\u2022 Aspect 1 \u2014 purchase economics and the decision to buy or decline EV trucks.", 1, False, 15, INK),
        ("\u2022 Aspect 2 \u2014 daily work, vehicle suitability and reliability.", 1, False, 15, INK),
        ("\u2022 Aspect 3 \u2014 charging, site costs and organisational implementation.", 1, False, 15, INK),
        ("Note: answers for Q6, Q7 and Q9 were not captured in the session and are omitted here.", 1, False, 12, GREY),
    ], space_after=8)

    # ---- Slide 4: Aspect 1 (Q1, Q2) --------------------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, WHITE)
    _header(s, "Aspect 1 \u2014 Purchase economics", "Early adoption was too expensive; demand has now arrived")
    _panel(s, Inches(0.6), Inches(1.75), Inches(5.95), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(0.85), Inches(1.95), Inches(5.5), Inches(4.8))
    _text(tb.text_frame, [
        ("Q1  Why one firm bought EV and another declined", 0, True, 15, TEAL),
        ("\u2022 ~10 years ago EV was very early adoption; cost was far higher than today.", 1, False, 13, INK),
        ("\u2022 Government push and industry tech improvement have since lowered cost.", 1, False, 13, INK),
        ("\u2022 Almost impossible to sell then; would only buy if a customer specifically asked.", 1, False, 13, INK),
        ("\u2022 Higher cost could be passed into a contract \u2014 only those willing to pay would take it.", 1, False, 13, INK),
        ("\u2022 It created awareness, but challenges outweighed; not worth being a flagship.", 1, False, 13, INK),
    ], space_after=6)
    _panel(s, Inches(6.85), Inches(1.75), Inches(5.85), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(7.1), Inches(1.95), Inches(5.4), Inches(4.8))
    _text(tb.text_frame, [
        ("Q2  Keep vs replace a truck with COE remaining", 0, True, 15, TEAL),
        ("\u2022 OneMotoring shows the trend in new EV registrations \u2014 adoption is rising.", 1, False, 13, INK),
        ("\u2022 Less resistance now; awareness is high and haze motivates clean energy. Demand IS there.", 1, False, 13, INK),
        ("\u2022 The real question is supply. Can it meet:", 1, False, 13, INK),
        ("\u2013 Specifications \u2014 mainly light commercial vans; few brands, small model selection.", 2, False, 12, GREY),
        ("\u2013 Operational needs \u2014 14-ft+ HGVs cannot use public car charging lots; drivers must know where charging is; half-a-day downtime is inefficient.", 2, False, 12, GREY),
        ("\u2013 Financial barrier \u2014 willingness to pay.", 2, False, 12, GREY),
    ], space_after=5)

    # ---- Slide 5: Aspect 1 (Q3) ------------------------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, WHITE)
    _header(s, "Aspect 1 \u2014 Purchase economics", "Q3  Full purchase & financing cost vs diesel")
    _panel(s, Inches(0.6), Inches(1.75), Inches(5.95), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(0.85), Inches(1.95), Inches(5.5), Inches(4.8))
    _text(tb.text_frame, [
        ("Self-sufficiency is a real estate & power problem", 0, True, 15, TEAL),
        ("\u2022 Being self-sufficient needs a LOT of charging points at base.", 1, False, 13, INK),
        ("\u2022 Drivers prefer to take vehicles home, not to base (an employee benefit).", 1, False, 13, INK),
        ("\u2022 Singapore is small \u2014 not enough parking for a base, and not for heavy vehicles.", 1, False, 13, INK),
        ("\u2022 The building itself needs a modern electrical system to charge multiple heavy-duty vehicles.", 1, False, 13, INK),
        ("\u2022 Charging at peak hours; public lots are not accommodating for heavy-vehicle charging.", 1, False, 13, INK),
    ], space_after=6)
    _panel(s, Inches(6.85), Inches(1.75), Inches(5.85), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(7.1), Inches(1.95), Inches(5.4), Inches(4.8))
    _text(tb.text_frame, [
        ("Vehicle cost & financing", 0, True, 15, TEAL),
        ("\u2022 Refrigerated truck is not a differentiator \u2014 ~30\u201340k, about the same as an ICE vehicle.", 1, False, 13, INK),
        ("\u2022 Cost is probably the same; maybe a slight EV enhancement since the battery powers the fridge, but costs are insignificant.", 1, False, 13, INK),
        ("Financing", 0, True, 14, GREEN),
        ("\u2022 Financing comes from banks.", 1, False, 13, INK),
        ("\u2022 Smaller firms rely on Hong Seh to link them with banks for hire purchase; big firms have better financing \u2014 but everyone pays almost the same rates.", 1, False, 13, INK),
        ("\u2022 Banks offer \u201cGreen financing\u201d (hire purchase, better interest) to every EV buyer \u2014 non-differentiated, a bank environmental initiative.", 1, False, 13, INK),
    ], space_after=5)

    # ---- Slide 6: Aspect 2 (Q4) ------------------------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, WHITE)
    _header(s, "Aspect 2 \u2014 Suitability & reliability", "Q4  Durability, scrap value and depreciation", accent=AMBER)
    _panel(s, Inches(0.6), Inches(1.75), Inches(3.9), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(0.8), Inches(1.95), Inches(3.55), Inches(4.8))
    _text(tb.text_frame, [
        ("Durability / range", 0, True, 15, AMBER),
        ("\u2022 ~10 years ago range was 150 km; now ~350 km.", 1, False, 13, INK),
        ("\u2022 Even in new condition you would seriously consider changing.", 1, False, 13, INK),
        ("\u2022 EV uptake has been growing for 4\u20135 years.", 1, False, 13, INK),
    ], space_after=6)
    _panel(s, Inches(4.7), Inches(1.75), Inches(3.9), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(4.9), Inches(1.95), Inches(3.55), Inches(4.8))
    _text(tb.text_frame, [
        ("Scrapping", 0, True, 15, AMBER),
        ("\u2022 Scrapping gives a rebate on the COE balance.", 1, False, 13, INK),
        ("\u2022 Goldbell EV trucks: very little scrap value.", 1, False, 13, INK),
        ("\u2022 Disposal cost \u2014 value of metal and battery is not high; people still charge to dispose.", 1, False, 13, INK),
        ("\u2022 Buyers can be quite skeptical.", 1, False, 13, INK),
    ], space_after=6)
    _panel(s, Inches(8.8), Inches(1.75), Inches(3.9), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(9.0), Inches(1.95), Inches(3.55), Inches(4.8))
    _text(tb.text_frame, [
        ("Depreciation", 0, True, 15, AMBER),
        ("\u2022 COE is more expensive now.", 1, False, 13, INK),
        ("\u2022 An EV bought 4\u20135 years ago has a carrying value (e.g. 100k) while today's COE is high.", 1, False, 13, INK),
        ("\u2022 New-EV vs old cost comparison: firms may resist purely because COE is too high.", 1, False, 13, INK),
    ], space_after=6)

    # ---- Slide 7: Aspect 2 (Q5, Q6, Q7) ----------------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, WHITE)
    _header(s, "Aspect 2 \u2014 Suitability & reliability", "Q5  Load / body / access fit (and gaps)", accent=AMBER)
    _panel(s, Inches(0.6), Inches(1.75), Inches(7.0), Inches(2.2))
    tb = s.shapes.add_textbox(Inches(0.85), Inches(2.0), Inches(6.55), Inches(1.8))
    _text(tb.text_frame, [
        ("Q5  What could stop an EV from replacing a diesel truck", 0, True, 16, AMBER),
        ("\u2022 \u201cAs long as this vehicle is not giving me trouble, we wouldn't want to add on.\u201d", 1, False, 15, INK),
        ("\u2022 Incumbency bias: a working truck is left alone rather than swapped.", 1, False, 14, GREY),
    ], space_after=8)
    _panel(s, Inches(0.6), Inches(4.2), Inches(12.1), Inches(2.4), fill=RGBColor(0xF7, 0xF3, 0xEA))
    tb = s.shapes.add_textbox(Inches(0.85), Inches(4.45), Inches(11.6), Inches(2.0))
    _text(tb.text_frame, [
        ("Not captured in this interview", 0, True, 15, GREY),
        ("\u2022 Q6 \u2014 loaded EV records on energy use, usable range and battery ageing: no notes captured.", 1, False, 14, GREY),
        ("\u2022 Q7 \u2014 service records on maintenance cost and downtime for comparable EV vs diesel: no notes captured.", 1, False, 14, GREY),
        ("These remain open questions for a follow-up with data access.", 1, False, 13, GREY),
    ], space_after=7)

    # ---- Slide 8: Aspect 3 (Q8) ------------------------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, WHITE)
    _header(s, "Aspect 3 \u2014 Charging & implementation", "Q8  Installation cost and the national grid limit")
    _panel(s, Inches(0.6), Inches(1.75), Inches(5.95), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(0.85), Inches(1.95), Inches(5.5), Inches(4.8))
    _text(tb.text_frame, [
        ("Parking, power and cost", 0, True, 15, TEAL),
        ("\u2022 Private charging operators are VERY tough \u2014 getting the land is not easy.", 1, False, 13, INK),
        ("\u2022 Would rather go back to SP Group and ask them to charge.", 1, False, 13, INK),
        ("\u2022 The electricity grid cannot support island-wide charging.", 1, False, 13, INK),
        ("\u2022 About half a million dollars total to install.", 1, False, 13, INK),
        ("\u2022 Vehicles cannot enter MSCPs \u2014 too tall for the 2 m height limit.", 1, False, 13, INK),
        ("\u2022 Open residential car parks exist, but limit use to residents.", 1, False, 13, INK),
        ("\u2022 A NATIONAL issue \u2014 too many people charging from the grid.", 1, False, 13, INK),
    ], space_after=5)
    _panel(s, Inches(6.85), Inches(1.75), Inches(5.85), Inches(5.1), fill=RGBColor(0xEC, 0xF5, 0xEC))
    tb = s.shapes.add_textbox(Inches(7.1), Inches(1.95), Inches(5.4), Inches(4.8))
    _text(tb.text_frame, [
        ("A workaround: battery swapping (SANY)", 0, True, 15, GREEN),
        ("\u2022 SANY offers models with a swap battery \u2014 very limited models.", 1, False, 14, INK),
        ("\u2022 The battery sits behind the cabin and can be swapped.", 1, False, 14, INK),
        ("\u2022 Aimed at container movers / prime movers.", 1, False, 14, INK),
        ("\u2022 Can charge while avoiding downtime, via swap stations.", 1, False, 14, INK),
    ], space_after=7)

    # ---- Slide 9: Aspect 3 (Q10) -----------------------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, WHITE)
    _header(s, "Aspect 3 \u2014 Charging & implementation", "Q10  Split ownership, leasing and the EV-vs-ICE call")
    _panel(s, Inches(0.6), Inches(1.75), Inches(5.95), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(0.85), Inches(1.95), Inches(5.5), Inches(4.8))
    _text(tb.text_frame, [
        ("Leasing is rare for EV commercial vehicles", 0, True, 15, TEAL),
        ("\u2022 Leasing EVs is not so common.", 1, False, 13, INK),
        ("\u2022 Grab-style lease for prime movers is quite rare \u2014 business is unreliable.", 1, False, 13, INK),
        ("\u2022 Consistency of availability/quality and legal accountability rule these lease services out.", 1, False, 13, INK),
        ("\u2022 Hybrids are quite rare for commercial vehicles.", 1, False, 13, INK),
    ], space_after=6)
    _panel(s, Inches(6.85), Inches(1.75), Inches(5.85), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(7.1), Inches(1.95), Inches(5.4), Inches(4.8))
    _text(tb.text_frame, [
        ("Acceptability is there \u2014 EV is preferred over hybrid", 0, True, 15, TEAL),
        ("\u2022 Acceptability already exists; it just needs to meet operational requirements.", 1, False, 13, INK),
        ("\u2022 EVs are low on maintenance and moving parts; between hybrid and EV, choose EV.", 1, False, 13, INK),
        ("\u2022 ICE disadvantages: battery concerns, engine mechanical issues.", 1, False, 13, INK),
        ("\u2022 Urban/city driving suits EV better and lasts longer than on highways.", 1, False, 13, INK),
        ("\u2022 Company decision-makers likely already drive an EV \u2014 hence openness to commercial EV.", 1, False, 13, INK),
        ("Open question: did the oil war shift the market \u2014 a surge in commercial EV sales/leases, or a \u201cwait it out\u201d industry?", 1, False, 12, AMBER),
    ], space_after=5)

    # ---- Slide 10: Secondary contacts part 1 -----------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, WHITE)
    _header(s, "Secondary / short contacts", "Workshops and a lessor", accent=GREY)
    _panel(s, Inches(0.6), Inches(1.75), Inches(5.95), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(0.85), Inches(1.95), Inches(5.5), Inches(4.8))
    _text(tb.text_frame, [
        ("King Auto Technologies & Engineering", 0, True, 15, TEAL),
        ("Mr Ong Bee Theng \u2014 Lead Engineer", 0, False, 12, GREY),
        ("\u2022 Most customers are relationship-based \u2014 they return to the same workshop even after changing vehicle.", 1, False, 13, INK),
        ("\u2022 Wide ICE knowledge; now upskilling to include EVs.", 1, False, 13, INK),
        ("\u2022 EV parts are indeed more expensive (newer, fewer sources) with more moving parts than a typical ICE (corroborated by RUSHOWL) \u2014 a touchy subject with mixed ICE/EV customers asking why prices differ.", 1, False, 13, INK),
        ("\u2022 Slow EV-truck adoption \u2014 \u201cnot so urgent\u201d to switch, no apparent immediate benefit or loss.", 1, False, 13, INK),
    ], space_after=5)
    _panel(s, Inches(6.85), Inches(1.75), Inches(5.85), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(7.1), Inches(1.95), Inches(5.4), Inches(4.8))
    _text(tb.text_frame, [
        ("Cosmopolitan Engineering Services", 0, True, 15, TEAL),
        ("Mr Ronald Lim \u2014 Engineering / Leasing Manager", 0, False, 12, GREY),
        ("\u2022 Very brief \u2014 only ~1 minute.", 1, False, 13, INK),
        ("\u2022 Has no EVs, but clients have asked him to lease EV before \u2014 the client was very eco-friendly (also corroborated by RUSHOWL).", 1, False, 13, INK),
        ("\u2022 Sees no rush to switch; everything should work fine for now.", 1, False, 13, INK),
        ("\u2022 Mentioned engine reliability \u2014 unclear whether he meant ICE or EV is less reliable.", 1, False, 13, INK),
    ], space_after=6)

    # ---- Slide 11: Secondary contacts part 2 -----------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, WHITE)
    _header(s, "Secondary / short contacts", "A driver and a workshop view", accent=GREY)
    _panel(s, Inches(0.6), Inches(1.75), Inches(5.95), Inches(5.1))
    tb = s.shapes.add_textbox(Inches(0.85), Inches(1.95), Inches(5.5), Inches(4.8))
    _text(tb.text_frame, [
        ("Tritech Engineering & Testing", 0, True, 15, TEAL),
        ("Mr Muthukumar \u2014 Driver (15 months)", 0, False, 12, GREY),
        ("\u2022 Concerned about vehicle weight \u2014 EV trucks are heavier than ICE and he thinks it will change how he drives; he will have to adapt.", 1, False, 13, INK),
        ("\u2022 Told they will likely scrap the current truck at 9 years \u2014 no expected scrap returns (heavy use) and they must save for the next truck's purchase price \u2014 but it probably would not be an EV.", 1, False, 13, INK),
    ], space_after=6)
    _panel(s, Inches(6.85), Inches(1.75), Inches(5.85), Inches(5.1), fill=RGBColor(0xEC, 0xF5, 0xEC))
    tb = s.shapes.add_textbox(Inches(7.1), Inches(1.95), Inches(5.4), Inches(4.8))
    _text(tb.text_frame, [
        ("Hock Wah Motor Workshop", 0, True, 15, GREEN),
        ("Mr Seng Wah \u2014 role unclear (manager?)", 0, False, 12, GREY),
        ("\u2022 Thinks EV is the future.", 1, False, 13, INK),
        ("\u2022 Making sure his mechanics are trained on EVs.", 1, False, 13, INK),
        ("\u2022 Thinks people will come around, especially with EV subsidies.", 1, False, 13, INK),
        ("\u2022 People only buy a new truck when they really need to \u2014 they reach the workshop when the truck is on its last leg, so pushing a switch NOW does not make sense; instead convince them their NEXT purchase should be EV.", 1, False, 13, INK),
    ], space_after=6)

    # ---- Slide 12: Key themes / takeaways --------------------------------
    s = prs.slides.add_slide(blank)
    _set_bg(s, INK)
    _accent_bar(s, GREEN, Inches(0.0))
    k = s.shapes.add_textbox(Inches(0.6), Inches(0.4), Inches(12.1), Inches(0.4))
    _text(k.text_frame, [("SYNTHESIS", 0, True, 13, GREEN)], space_after=0)
    t = s.shapes.add_textbox(Inches(0.6), Inches(0.78), Inches(12.1), Inches(0.8))
    _text(t.text_frame, [("Key themes & takeaways", 0, True, 30, WHITE)], space_after=0)
    tb = s.shapes.add_textbox(Inches(0.7), Inches(1.9), Inches(11.9), Inches(5.2))
    _text(tb.text_frame, [
        ("1. Demand is no longer the blocker \u2014 supply and infrastructure are.", 0, True, 17, GREEN),
        ("Awareness is high and haze motivates clean energy; the open questions are model choice, operational fit and willingness to pay.", 1, False, 14, RGBColor(0xD8, 0xDF, 0xE1)),
        ("2. Charging is a national, real-estate and grid problem.", 0, True, 17, GREEN),
        ("~half a million to install; MSCP 2 m height locks out trucks; the grid cannot support island-wide charging. Battery swapping (SANY) is an emerging workaround.", 1, False, 14, RGBColor(0xD8, 0xDF, 0xE1)),
        ("3. Economics: parity on vehicle, pain on COE, scrap and financing sameness.", 0, True, 17, GREEN),
        ("Refrigerated EV vs ICE cost is roughly the same; weak EV scrap value and high COE deter replacement; \u201cGreen financing\u201d is offered to all EV buyers and is non-differentiated.", 1, False, 14, RGBColor(0xD8, 0xDF, 0xE1)),
        ("4. EV is preferred over hybrid once operational needs are met \u2014 but nobody rushes.", 0, True, 17, GREEN),
        ("Workshops and drivers see no urgency; the practical lever is to win the NEXT purchase, not force a switch today. Leasing EV commercial vehicles remains rare.", 1, False, 14, RGBColor(0xD8, 0xDF, 0xE1)),
    ], space_after=9)

    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "interview-findings.pptx")
    prs.save(out_path)
    print(f"Wrote {out_path} ({len(prs.slides._sldIdLst)} slides)")
    return out_path


if __name__ == "__main__":
    build()
