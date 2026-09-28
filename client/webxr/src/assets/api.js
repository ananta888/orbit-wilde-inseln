/** Public tool contract. This client has no provider credentials or policy overrides. */
export async function assetTool(name, args, { signal } = {}) {
  const response = await fetch('/api/assets/tools/' + name, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal });
  const result = await response.json();
  if (!response.ok) throw Error(result.error?.message || 'Assetauftrag fehlgeschlagen');
  return result;
}

export function localLicense(kind, creator, sourceUrl, version = '') {
  version ||= kind === 'CC0' ? '1.0' : kind.startsWith('CC-') ? '4.0' : '';
  return { license: kind, version, creator, source: 'local', sourceAssetId: 'manual', sourceUrl,
    evidenceUrl: sourceUrl, notice: '', downloadDate: null, modifications: [], attributionRequired: kind.startsWith('CC-BY'),
    licenseUrl: kind === 'CC0' ? `https://creativecommons.org/publicdomain/zero/${version}/`
      : kind.startsWith('CC-') ? `https://creativecommons.org/licenses/${kind.slice(3).toLowerCase()}/${version}/` : '' };
}
