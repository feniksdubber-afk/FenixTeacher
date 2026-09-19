"""
exercise_extractor (FenixTeacher PDF-service)
- baseline (bottom) based line grouping, NOT top
- page_type gate before exercise detection
- exercise_number, page_number, bbox, xom_matn, column/block, audio marker, reading-order position
- sequence check -> needs_review flag (never deletes/mutates xom_matn)
- x-band step BEFORE heading detection: baseline lines are split into
  segments at wide horizontal gaps, so the audio-track label column ("1.2")
  is never glued into the main text column; icon-glyph OCR junk is ignored
  for heading detection only
- needs_review propagates from a numeric heading to its inherited sub-headings
"""
import pdfplumber
import re

AUDIO_RE = re.compile(r'\bCD\s*\d+\s*,\s*\d+\b')
EXERCISE_HEAD_RE = re.compile(r'^\s*(\d{1,2})\s*([a-zA-Z]?)\s+([A-ZÄÖÜ„].{3,})')
FALSE_POSITIVE_RE = re.compile(r'^\s*\d{1,2}\s+(Uhr|Richtig|Falsch|Jahre?)\b')
# A lone-letter continuation heading, e.g. "b Arbeiten Sie ...". Requires a
# SPACE right after the letter (excludes "a) ..." which has no space there),
# and a capitalized word start (excludes normal prose fragments).
SUBHEADING_RE = re.compile(r'^\s*([a-hA-H])\s+([A-ZÄÖÜ„].{3,})')
# Audio track label: standalone small column at the far left ("1.2", "1.13").
AUDIO_LABEL_RE = re.compile(r'^\s*\d{1,2}[.,]\d{1,2}\s*$')
# OCR read the label as a bare number ("1.5" -> "15"): only FLAGGED, never removed.
AUDIO_LABEL_CANDIDATE_RE = re.compile(r'^\s*\d{2,3}\s*$')
AUDIO_COLUMN_MAX_X_RATIO = 0.12   # label column lives in the left 12% of the page
SEGMENT_GAP_FACTOR = 1.8          # split a baseline line where gap > 1.8 x font size
FOOTER_ZONE_RATIO = 0.90  # bottom 10% of page height treated as footer candidate zone


def get_lines(page, tol=4):
    """Group chars into lines using baseline (bottom), not top."""
    chars = sorted(page.chars, key=lambda c: (c['bottom'], c['x0']))
    lines = []
    for c in chars:
        placed = False
        for line in lines:
            if abs(line['bottom'] - c['bottom']) <= tol:
                line['chars'].append(c)
                n = len(line['chars'])
                line['bottom'] = (line['bottom'] * (n - 1) + c['bottom']) / n
                placed = True
                break
        if not placed:
            lines.append({'bottom': c['bottom'], 'chars': [c]})
    out = []
    for line in lines:
        cs = sorted(line['chars'], key=lambda c: c['x0'])
        text = ''.join(c['text'] for c in cs)
        out.append({
            'bottom': line['bottom'],
            'top': min(c['top'] for c in cs),
            'x0': min(c['x0'] for c in cs),
            'x1': max(c['x1'] for c in cs),
            'text': text,
            'size': max(c['size'] for c in cs),
            'chars': cs,
        })
    out.sort(key=lambda l: l['bottom'])
    return out


def split_segments(line, gap_factor=SEGMENT_GAP_FACTOR):
    """
    x-band step: split ONE baseline line into segments at wide horizontal
    gaps. Whitespace chars stay with the segment on their left, so joining
    the segment texts reproduces the original raw line text exactly.
    The gap is measured against the larger of the two neighbouring font sizes,
    so a big exercise numeral ("1" at 33pt) is NOT split from its text.
    """
    cs = line['chars']
    real = [i for i, c in enumerate(cs) if c['text'].strip()]
    starts = [0]
    for a, b in zip(real, real[1:]):
        ca, cb = cs[a], cs[b]
        if cb['x0'] - ca['x1'] > gap_factor * max(ca['size'], cb['size']):
            starts.append(b)
    starts.append(len(cs))
    segs = []
    for s, e in zip(starts, starts[1:]):
        part = cs[s:e]
        segs.append({
            'text': ''.join(c['text'] for c in part),
            'x0': min(c['x0'] for c in part), 'x1': max(c['x1'] for c in part),
            'top': min(c['top'] for c in part), 'bottom': line['bottom'],
            'size': max(c['size'] for c in part),
        })
    return segs


def is_icon_segment(seg):
    """OCR garbage of a speaker/target icon: short, has ')' or '»', no real word."""
    t = seg['text'].strip()
    return (0 < len(t) <= 8 and ' ' not in t and re.search(r'[)»]', t) is not None
            and not re.search(r'[A-Za-zÄÖÜäöüß]{4,}', t))


def build_flow(page, lines):
    """
    Turn baseline lines into main-flow lines + the separated audio-label column.
    Returns (flow_lines, audio_labels).
    flow line text = raw joined text of its non-label segments (chars unchanged);
    head_text = same minus a leading icon-glyph token (used ONLY for heading
    detection, never written to xom_matn).
    NOTE: side boxes ("SPRACHE IM ALLTAG") are deliberately NOT separated here -
    geometry alone cannot tell them from a right-hand table column.
    """
    W = page.width
    flow, audio_labels = [], []
    for l in lines:
        keep = []
        for s in split_segments(l):
            if AUDIO_LABEL_RE.match(s['text']) and s['x0'] < AUDIO_COLUMN_MAX_X_RATIO * W:
                audio_labels.append(s)
            else:
                keep.append(s)
        if not keep:
            continue
        text = ''.join(s['text'] for s in keep)
        head = text
        first = text.split(None, 1)
        if len(first) == 2 and is_icon_segment({'text': first[0]}):
            head = first[1]
        flow.append({
            'bottom': l['bottom'],
            'top': min(s['top'] for s in keep),
            'x0': min(s['x0'] for s in keep),
            'x1': max(s['x1'] for s in keep),
            'text': text,
            'head_text': head,
            'size': max(s['size'] for s in keep),
            'segments': keep,
        })
    return flow, audio_labels


def lines_segments(lines):
    return [s for l in lines for s in l['segments']]


def group_into_blocks(lines, x_gap_tol=40, y_gap_tol=60):
    """
    Group lines into horizontal-band blocks by x-overlap, then order
    within/between bands by y. This is a simplified stand-in for the
    full x-overlap band grouping discussed earlier; good enough to
    validate exercise detection + reading order on these two pages.
    """
    # Cluster by x0 into rough bands (left column / right column / full width)
    # without hardcoding which is "left" vs "right" - just cluster by proximity.
    bands = []
    for l in lines:
        placed = False
        for b in bands:
            if abs(b['x0'] - l['x0']) <= x_gap_tol:
                b['lines'].append(l)
                placed = True
                break
        if not placed:
            bands.append({'x0': l['x0'], 'lines': [l]})
    return bands


def detect_page_type(lines):
    header = ' '.join(l['text'] for l in lines[:8])
    if re.search(r'Grammatik', header) and re.search(r'R[üu]ckschau', header):
        return 'grammatik_rueckschau'
    return 'kursbuch_exercise_or_text'


def is_footer_line(line, page_height):
    """
    Position-based footer signal: bottom N% of page. Not tied to any
    specific string (e.g. "The German Bookshop") since that text will
    differ across scans/publishers - position is the portable signal.
    """
    return line['top'] >= page_height * FOOTER_ZONE_RATIO


def detect_headings(lines, page_height):
    """
    Two passes:
    1. Numeric headings ("1", "1a", "2", "3b") via EXERCISE_HEAD_RE.
    2. Lone-letter continuation headings ("b", "c") that inherit the
       parent exercise's leading number - ONLY accepted if:
         - a numeric heading with a matching letter sequence came
           before it (e.g. "b" only valid right after "1a" or "1"),
         - it is not inside the footer zone,
         - it is not a false-positive shape like "a) ..." (excluded by
           SUBHEADING_RE requiring a space, not punctuation, after the
           letter).
    Returns a flat, ordered list of heading dicts with resolved
    exercise_number, each tagged with its kind (numeric/sub) for
    transparency.
    """
    headings = []
    current_parent_num = None   # e.g. "1" from "1a"
    expected_next_letter = None  # e.g. "b" expected after "a"

    for idx, l in enumerate(lines):
        if is_footer_line(l, page_height):
            continue  # footer text never considered as a heading candidate

        m = EXERCISE_HEAD_RE.match(l['head_text'])
        if m and not FALSE_POSITIVE_RE.match(l['head_text']):
            num, letter = m.group(1), m.group(2).lower()
            headings.append({
                'line_idx': idx, 'line': l,
                'number': num + letter, 'kind': 'numeric',
            })
            current_parent_num = num
            expected_next_letter = chr(ord(letter) + 1) if letter else 'b'
            continue

        sm = SUBHEADING_RE.match(l['head_text'])
        if sm and current_parent_num is not None:
            letter = sm.group(1).lower()
            if letter == expected_next_letter:
                headings.append({
                    'line_idx': idx, 'line': l,
                    'number': current_parent_num + letter, 'kind': 'sub_inherited',
                })
                expected_next_letter = chr(ord(letter) + 1)
            # else: looks like "a)"-style prose or an out-of-sequence
            # letter -> deliberately NOT treated as a heading; stays
            # inside the previous exercise's xom_matn untouched.

    return headings


def extract_exercises(pdf_path, page_index, page_number_label):
    with pdfplumber.open(pdf_path) as pdf:
        return extract_exercises_from_page(pdf.pages[page_index], page_index, page_number_label)


def extract_exercises_from_page(page, page_index, page_number_label):
    """Bitta allaqachon ochilgan pdfplumber sahifasidan mashqlarni ajratadi."""
    page_height = page.height
    baseline_lines = get_lines(page)
    # x-band step: split columns/labels/side boxes out BEFORE heading detection
    lines, audio_labels = build_flow(page, baseline_lines)
    page_type = detect_page_type(lines)

    result = {
        'page_index': page_index,
        'page_number_label': page_number_label,
        'page_type': page_type,
        'exercises': [],
        'gated_out': [],
        'footer_lines': [l['text'].strip() for l in lines if is_footer_line(l, page_height)],
    }

    if page_type != 'kursbuch_exercise_or_text':
        for l in lines:
            if is_footer_line(l, page_height):
                continue
            m = EXERCISE_HEAD_RE.match(l['head_text'])
            if m and not FALSE_POSITIVE_RE.match(l['head_text']):
                result['gated_out'].append({
                    'would_be_number': m.group(1) + m.group(2),
                    'text': l['text'].strip()[:70],
                    'reason': f'page_type={page_type}, not an exercise page',
                })
        return result

    headings = detect_headings(lines, page_height)

    # Build exercise blocks: text from this heading's line up to (not
    # including) the next heading's line OR the start of the footer
    # zone, whichever comes first. xom_matn stays raw/unaltered aside
    # from excluding footer lines (footer is a structural element of
    # the page, not the exercise's own content).
    for i, h in enumerate(headings):
        start_idx = h['line_idx']
        end_idx = headings[i + 1]['line_idx'] if i + 1 < len(headings) else len(lines)
        block_lines = [
            l for l in lines[start_idx:end_idx]
            if not is_footer_line(l, page_height)
        ]

        xom_matn = '\n'.join(l['text'] for l in block_lines)

        x0 = min(l['x0'] for l in block_lines)
        x1 = max(l['x1'] for l in block_lines)
        top = min(l['top'] for l in block_lines)
        bottom = max(l['bottom'] for l in block_lines)

        # Audio labels / side text belong to the exercise whose vertical
        # range contains them (heading top -> next heading top / page end).
        y_from = top
        y_to = headings[i + 1]['line']['top'] if i + 1 < len(headings) else float('inf')
        labels = [s['text'].strip() for s in audio_labels if y_from <= s['bottom'] < y_to]
        if not labels:  # legacy inline "CD 1, 12" format, kept as fallback
            am = AUDIO_RE.search(xom_matn)
            labels = [am.group(0)] if am else []
        # OCR read "1.5" as "15": a bare number in the audio column. Flag only.
        cand = [s['text'].strip() for s in lines_segments(lines)
                if AUDIO_LABEL_CANDIDATE_RE.match(s['text'])
                and s['x0'] < AUDIO_COLUMN_MAX_X_RATIO * page.width
                and not is_footer_line(s, page_height)
                and y_from <= s['bottom'] < y_to]

        result['exercises'].append({
            'exercise_number': h['number'],
            'heading_kind': h['kind'],
            'page_number': page_number_label,
            'bbox': [round(x0, 1), round(top, 1), round(x1, 1), round(bottom, 1)],
            'xom_matn': xom_matn,
            'reading_order_position': i,
            'audio_marker': labels[0] if labels else None,
            'audio_markers': labels,
            'needs_review': bool(cand),
            'needs_review_reason': (f'audio_marker_ocr_candidate: {cand}' if cand else None),
        })

    # Sequence check on the numeric part only. Flag, never drop.
    prev_num = None
    parent = None  # last numeric heading; its review status is inherited by "b", "c"...
    for ex in result['exercises']:
        m = re.match(r'(\d+)', ex['exercise_number'])
        cur_num = int(m.group(1)) if m else None
        if (ex['heading_kind'] == 'sub_inherited' and parent is not None
                and parent.get('seq_break_reason')):
            ex['needs_review'] = True
            ex['needs_review_reason'] = (
                f"inherited from parent {parent['exercise_number']}: {parent['seq_break_reason']}")
        if prev_num is not None and cur_num is not None and ex['heading_kind'] == 'numeric':
            if cur_num < prev_num or cur_num > prev_num + 1:
                reason = f'sequence break: previous integer part {prev_num}, this one {cur_num}'
                ex['seq_break_reason'] = reason
                ex['needs_review_reason'] = (
                    reason if not ex['needs_review_reason']
                    else f"{reason}; {ex['needs_review_reason']}")
                ex['needs_review'] = True
        if cur_num is not None and ex['heading_kind'] == 'numeric':
            prev_num = cur_num
        if ex['heading_kind'] == 'numeric':
            parent = ex

    return result



def _chapter_for_printed_page(printed, chapters):
    """Chop etilgan sahifa raqami qaysi bobga tushishini topadi (None = hech biriga)."""
    if printed is None:
        return None
    for ch in chapters:
        if ch['sahifa_boshi'] <= printed <= (ch.get('sahifa_oxiri') or ch['sahifa_boshi']):
            return ch['tartib_raqami']
    return None


def extract_book_exercises(pdf_path, chapters, offset=None):
    """
    Butun kitob bo'yicha: PDF BIR marta ochiladi (json_builder FIX #9 bilan bir xil).

    chapters: [{tartib_raqami, sahifa_boshi, sahifa_oxiri}, ...] - chapters jadvalidan.
    offset:   jismoniy_sahifa - chop_etilgan_raqam. None bo'lsa json_builder'dagi
              usul bilan avtomatik aniqlanadi (chapters bo'sh bo'lsa 0).

    Qaytaradi: {sahifa_offseti, sahifalar_soni, mashqlar: [...], xato_sahifalar: [...]}
    Bitta sahifadagi xato butun kitobni to'xtatmaydi - xato_sahifalar'ga yoziladi.
    """
    if offset is None:
        if chapters:
            from .json_builder import detect_page_offset  # circular import'dan qochish uchun kechiktirilgan
            first = min(c['sahifa_boshi'] for c in chapters[:5])
            offset = detect_page_offset(pdf_path, list(range(first, first + 10)))
        else:
            offset = 0

    mashqlar, xato_sahifalar = [], []
    with pdfplumber.open(pdf_path) as pdf:
        n_pages = len(pdf.pages)
        for idx in range(n_pages):
            physical = idx + 1
            printed = physical - offset
            if printed < 1:
                printed = None
            try:
                res = extract_exercises_from_page(pdf.pages[idx], idx, str(physical))
            except Exception as e:  # noqa: BLE001 - sahifa darajasida izolyatsiya
                xato_sahifalar.append({'sahifa': physical, 'xato': str(e)})
                continue
            chapter_no = _chapter_for_printed_page(printed, chapters)
            for ex in res['exercises']:
                mashqlar.append({
                    'exercise_number': ex['exercise_number'],
                    'heading_kind': ex['heading_kind'],
                    'xom_matn': ex['xom_matn'],
                    'page_physical': physical,
                    'page_printed': printed,
                    'bbox': ex['bbox'],
                    'reading_order_position': ex['reading_order_position'],
                    'audio_markers': ex['audio_markers'],
                    'page_type': res['page_type'],
                    'needs_review': ex['needs_review'],
                    'needs_review_reason': ex['needs_review_reason'],
                    'chapter_tartib_raqami': chapter_no,
                })
    return {
        'sahifa_offseti': offset,
        'sahifalar_soni': n_pages,
        'mashqlar': mashqlar,
        'xato_sahifalar': xato_sahifalar or None,
    }


if __name__ == '__main__':
    # Lokal sinov:  python -m app.services.exercise_extractor kitob.pdf 14 27 31
    # (sahifalar jismoniy, 1-based; natija chop etiladi, DB'ga tegilmaydi)
    import json
    import sys

    pdf_file, *pages = sys.argv[1:]
    for p in pages:
        res = extract_exercises(pdf_file, int(p) - 1, p)
        res.pop('footer_lines', None)
        print(json.dumps(res, ensure_ascii=False, indent=2))
