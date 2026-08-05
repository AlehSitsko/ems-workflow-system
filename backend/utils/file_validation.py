"""Content-based validation for uploaded employee documents.

The upload route cannot trust the client-supplied ``Content-Type`` or the
filename extension — both are attacker-controlled. This module inspects the
*actual bytes* (magic signatures, plus a real ZIP/OOXML check for ``.docx``) and
cross-checks three things that must all agree:

  * the filename **extension**,
  * the declared **MIME type** (when the browser sent a recognised one), and
  * the **detected** type from the content.

Anything that disagrees is rejected, in particular HTML/SVG/script polyglots
dressed up as a PDF or image (a stored-XSS vector, since documents are served
from the app's own origin). No external binary (libmagic) is used, so this stays
pure-Python and packages cleanly into the PyInstaller/Electron build.

A :func:`scan_upload` hook is provided as the seam for a future real malware
scanner (ClamAV, Defender, a cloud scan). In this local MVP it is a documented
no-op — see its docstring.
"""

import io
import os
import re
import zipfile


class UploadValidationError(ValueError):
    """Raised when an uploaded file fails content validation (maps to HTTP 400)."""


class DetectedType:
    __slots__ = ("name", "ext", "mime")

    def __init__(self, name, ext, mime):
        self.name = name      # canonical short name, e.g. "pdf"
        self.ext = ext        # canonical extension to store, e.g. ".pdf"
        self.mime = mime      # canonical MIME, e.g. "application/pdf"


# ── Magic-signature detectors (operate on the leading bytes) ─────────────────
def _is_pdf(head):
    return head.startswith(b"%PDF-")


def _is_png(head):
    return head.startswith(b"\x89PNG\r\n\x1a\n")


def _is_jpeg(head):
    return head.startswith(b"\xff\xd8\xff")


def _is_webp(head):
    return head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def _is_ole(head):
    # Legacy .doc (OLE2 compound file).
    return head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")


def _is_zip(head):
    return head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06") or head.startswith(b"PK\x07\x08")


# name -> (canonical ext, canonical MIME, {allowed extensions}, {recognised MIMEs}, detector)
_MAGIC_TYPES = {
    "pdf": (".pdf", "application/pdf", {".pdf"}, {"application/pdf"}, _is_pdf),
    "png": (".png", "image/png", {".png"}, {"image/png"}, _is_png),
    "jpeg": (".jpg", "image/jpeg", {".jpg", ".jpeg"}, {"image/jpeg"}, _is_jpeg),
    "webp": (".webp", "image/webp", {".webp"}, {"image/webp"}, _is_webp),
    "doc": (".doc", "application/msword", {".doc"}, {"application/msword"}, _is_ole),
}
_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

# Every MIME we recognise as an allowed type — used to decide whether a *declared*
# MIME is "a known type that must then match the content" vs an unknown/generic one
# (octet-stream) that we simply ignore in favour of content detection.
_ALL_ALLOWED_MIMES = {mime for (_e, mime, _x, _m, _d) in _MAGIC_TYPES.values()} | {_DOCX_MIME}
_ALL_ALLOWED_EXTS = set().union(*[exts for (_e, _mi, exts, _m, _d) in _MAGIC_TYPES.values()]) | {".docx"}

# Leading-bytes patterns that mean "this is markup / a script", never an allowed
# binary document. PDFs/images/OOXML never begin with these.
_MARKUP_START = re.compile(rb"^\s*(?:\xef\xbb\xbf)?\s*<")
_MARKUP_SIGNS = (b"<!doctype", b"<html", b"<svg", b"<?xml", b"<script")


def _looks_like_docx(content):
    """True only for a real Word OOXML package (a ZIP with the OOXML members),
    so a random or polyglot ZIP is not accepted as a document."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            names = zf.namelist()
    except (zipfile.BadZipFile, OSError):
        return False
    return "[Content_Types].xml" in names and any(n.startswith("word/") for n in names)


def _reject_markup(head):
    lowered = head[:2048].lower()
    if _MARKUP_START.match(head) or any(sig in lowered for sig in _MARKUP_SIGNS):
        raise UploadValidationError(
            "This file looks like HTML, SVG or a script, not a document. "
            "Upload a PDF, JPG, PNG, WEBP or Word file."
        )


def validate_upload(file_storage):
    """Validate an uploaded ``werkzeug`` ``FileStorage`` by its content.

    Returns a :class:`DetectedType` on success; raises
    :class:`UploadValidationError` (HTTP 400) otherwise. Leaves the stream
    rewound to the start so the caller can still save it.
    """
    filename = file_storage.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    declared = (file_storage.mimetype or "").lower().split(";")[0].strip()

    content = file_storage.read()
    file_storage.seek(0)
    if not content:
        raise UploadValidationError("The uploaded file is empty.")
    head = content[:2048]

    # 1) Detect the real type from the bytes (authoritative). A binary type is
    #    identified by a strict leading magic signature; .docx by a real OOXML
    #    ZIP check — so trailing bytes can't sneak a different type past detection.
    detected = None
    detected_exts = set()
    for name, (canon_ext, canon_mime, exts, _mimes, detector) in _MAGIC_TYPES.items():
        if detector(head):
            detected = DetectedType(name, canon_ext, canon_mime)
            detected_exts = exts
            break
    else:
        if _is_zip(head) and _looks_like_docx(content):
            detected = DetectedType("docx", ".docx", _DOCX_MIME)
            detected_exts = {".docx"}

    # 2) Nothing matched. Give the clearer "this is markup" error when it applies
    #    (an .html/.svg/script masquerading as a document), else a generic reject.
    #    The markup check runs only here — a real .docx legitimately contains
    #    '<?xml' in its (uncompressed) ZIP members, and is already accepted above.
    if detected is None:
        _reject_markup(head)
        raise UploadValidationError(
            "The file content does not match an allowed document type "
            "(PDF, JPG, PNG, WEBP or DOCX)."
        )

    # 3) Extension must match the detected content.
    if ext not in detected_exts:
        raise UploadValidationError(
            f"The file extension ({ext or 'none'}) does not match its actual "
            f"content ({detected.name})."
        )

    # 4) If the browser declared a *recognised* type, it must match the content;
    #    an empty or generic (octet-stream) declaration is ignored — content wins.
    if declared and declared in _ALL_ALLOWED_MIMES and declared != detected.mime:
        raise UploadValidationError(
            "The declared file type does not match the file content."
        )

    return detected


def safe_display_name(filename, fallback="document"):
    """A display-only filename safe to echo in a Content-Disposition header.

    Strips any path components and control characters. The on-disk name is a
    server-generated UUID (see storage.save_file), so this only sanitises the
    human-facing label stored in the DB and sent back as the download name.
    """
    # Treat both separators as path delimiters on every OS (os.path.basename only
    # splits on the host's separator), then keep just the final component.
    base = re.split(r"[\\/]", filename or "")[-1]
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip()
    return base or fallback


def scan_upload(file_storage):
    """Malware-scan hook for an uploaded file — the seam for a real scanner.

    **Limitation (documented, honest):** the local/standalone MVP does not ship a
    malware scanner. This is a no-op that always reports "clean". Content-type
    validation (:func:`validate_upload`) plus download-only serving with
    ``nosniff`` remove the stored-XSS/execution vectors, but they are not
    anti-malware.

    To add real scanning later, implement the scan here (e.g. shell out to
    ClamAV's ``clamd``, call Windows Defender's MpCmdRun, or a cloud scan) and
    raise :class:`UploadValidationError` on a positive detection — no route change
    is needed. Rewinds the stream if it reads it.
    """
    # Intentionally a no-op in this MVP. Kept as the single call-site so a future
    # scanner has one place to live.
    return "clean"
