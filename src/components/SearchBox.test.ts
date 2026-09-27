import { describe, expect, it } from "vitest";
import { normalizeAddress, parcelPrefix, searchLots } from "./SearchBox";

const index = [
  { addr: normalizeAddress("5118 Ladora Wy"), id: "0056n00203000000" },
  { addr: normalizeAddress("1716 Monterey St"), id: "0023e00093000000" },
  { addr: normalizeAddress("0 Forbes Av"), id: "0086l00500000000" },
];

describe("search", () => {
  it("spells out street suffixes on both sides", () => {
    expect(normalizeAddress("5118 Ladora Way")).toBe(normalizeAddress("5118 LADORA WY"));
    expect(searchLots(index, "5118 ladora way")).toEqual([0]);
    expect(searchLots(index, "1716 monterey street")).toEqual([1]);
    expect(searchLots(index, "forbes ave")).toEqual([2]);
  });

  it("reads block-lot numbers as parcel prefixes", () => {
    expect(parcelPrefix("56-N-203")).toBe("0056n00203");
    expect(parcelPrefix("23 E 93")).toBe("0023e00093");
    expect(parcelPrefix("0056N00203000000")).toBe("0056n00203000000");
    expect(searchLots(index, "56-N-203")).toEqual([0]);
    expect(searchLots(index, "0056N00203000000")).toEqual([0]);
    expect(searchLots(index, "0086")).toEqual([2]);
  });

  it("finds nothing for nonsense", () => {
    expect(searchLots(index, "zzzz qqq")).toEqual([]);
  });
});
