import { DISTRICTS, lookupDistrict, normalizeZone, UNENCODED_DISTRICT_NAME } from "@/lib/engine";

export function districtName(zone: string): string | null {
  if (!zone) return null;
  const d = lookupDistrict("current", zone);
  if (d) return d.name;
  const prefix = normalizeZone(zone).split("-")[0];
  return UNENCODED_DISTRICT_NAME[prefix] ?? null;
}

export function encodedDistricts(): string[] {
  return Object.keys(DISTRICTS.current).sort();
}
