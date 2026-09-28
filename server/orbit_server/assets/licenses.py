"""Conservative build policy; attribution and evidence survive every derivation."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

KINDS = ("CC0", "CC-BY", "CC-BY-SA", "CC-BY-NC", "CC-BY-ND", "CC-BY-NC-SA",
         "CC-BY-NC-ND", "Public Domain", "Custom", "Unknown")


def license_record(kind: str, creator: str, source: str, ident: str, url: str,
                   *, version: str = "", evidence: str = "", notice: str = "") -> dict[str, Any]:
    if kind not in KINDS: kind = "Unknown"
    slug = "zero" if kind == "CC0" else kind.lower().removeprefix("cc-")
    version = version or ("1.0" if kind == "CC0" else "4.0" if kind.startswith("CC-") else "")
    license_url = (f"https://creativecommons.org/publicdomain/zero/{version}/" if kind == "CC0" else
                   f"https://creativecommons.org/licenses/{slug}/{version}/" if kind.startswith("CC-") else "")
    return {"license": kind, "version": version, "licenseUrl": license_url,
            "creator": creator[:1000], "source": source, "sourceAssetId": ident, "sourceUrl": url,
            "evidenceUrl": evidence or url, "notice": notice[:8000], "downloadDate": None,
            "modifications": [], "attributionRequired": kind.startswith("CC-BY")}


@dataclass(frozen=True)
class LicensePolicy:
    commercial: bool = True
    allowed: tuple[str, ...] = ("CC0", "Public Domain", "CC-BY")
    custom_evidence: tuple[str, ...] = ()

    def decision(self, license: dict, *, modified: bool = True) -> dict:
        kind = license.get("license", "Unknown")
        reasons = []
        if kind not in KINDS or kind == "Unknown": reasons.append("Lizenz unbekannt")
        if self.commercial and "NC" in kind: reasons.append("NC ist für diesen kommerziell nutzbaren Build gesperrt")
        if modified and "ND" in kind: reasons.append("ND erlaubt diesen Bearbeitungspfad nicht")
        if kind not in self.allowed: reasons.append("Lizenz ist nicht ausdrücklich freigegeben")
        if kind == "Custom" and license.get("evidenceUrl") not in self.custom_evidence:
            reasons.append("Individuelle Lizenz benötigt eine Betreiberfreigabe der Lizenzquelle")
        if not license.get("sourceUrl") or not license.get("evidenceUrl"):
            reasons.append("Quell-/Lizenznachweis fehlt")
        if kind.startswith("CC-BY") and (not license.get("creator") or not license.get("licenseUrl")):
            reasons.append("Urheber oder konkreter Lizenzlink fehlt")
        return {"allowed": not reasons, "status": "allowed" if not reasons else "quarantine", "reasons": reasons,
                "shareAlike": "SA" in kind, "rank": 0 if kind in {"CC0", "Public Domain"} else 1 if kind == "CC-BY" else 2}


def credits(records: list[dict], policy: LicensePolicy) -> str:
    lines = ["# Asset credits", "", "Generated from the pinned assets in this build.", ""]
    for record in sorted(records, key=lambda r: (r["name"], r["id"])):
        license = record["license"]
        if not policy.decision(license)["allowed"]:
            raise ValueError("Build enthält ein gesperrtes Asset: " + record["id"])
        # Plain text fields, not HTML; all mandatory attribution and notices retained.
        lines += [f"## {record['name']}", f"Creator: {license['creator']}",
                  f"License: {license['license']} {license['version']} {license['licenseUrl']}",
                  f"Source: {license['sourceUrl']}", f"Evidence: {license['evidenceUrl']}",
                  f"Asset: {record['id']} / SHA-256 {record['sha256'] or ', '.join(f['sha256'] for f in record['sourceFiles'])}", license['notice'],
                  "Changes: " + "; ".join(license["modifications"]), ""]
        for inherited in record.get("sourceLicenses", []):
            if not policy.decision(inherited)["allowed"]: raise ValueError("Gesperrte eingebettete Quelllizenz")
            lines += [f"Included source: {inherited['creator']} · {inherited['license']} {inherited['version']}",
                      inherited['licenseUrl'], inherited['sourceUrl'], inherited['notice'],
                      "Source changes: " + "; ".join(inherited['modifications']), ""]
    return "\n".join(lines)
