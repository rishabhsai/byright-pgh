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

  it("ranks the queried house number, neighborhood and parcel substring", () => {
    const idx = [
      {
        addr: normalizeAddress("2114 Forbes Ave"),
        id: "0011k00191000000",
        hood: normalizeAddress("Bluff"),
      },
      {
        addr: normalizeAddress("0 Forbes Ave"),
        id: "0011k00192000000",
        hood: normalizeAddress("Bluff"),
      },
      {
        addr: normalizeAddress("0 Forbes Ave"),
        id: "0011l00170000000",
        hood: normalizeAddress("Bluff"),
        evaluated: false,
      },
      {
        addr: normalizeAddress("6 Forbes Ave"),
        id: "0011s00007000000",
        hood: normalizeAddress("South Oakland"),
      },
      {
        addr: normalizeAddress("500 Forbes Ave"),
        id: "0002k00002000000",
        hood: normalizeAddress("Central Business District"),
        evaluated: false,
      },
      {
        addr: normalizeAddress("2212 Forbes Av"),
        id: "0011l00172000000",
        hood: normalizeAddress("Bluff"),
      },
      {
        addr: normalizeAddress("2410 Forbes Av"),
        id: "0011l00280000000",
        hood: normalizeAddress("South Oakland"),
      },
      {
        addr: normalizeAddress("0 Forbes Av"),
        id: "0086l00500000000",
        hood: normalizeAddress("Squirrel Hill South"),
      },
      {
        addr: normalizeAddress("126 Carrington"),
        id: "0023a00001000000",
        hood: normalizeAddress("Central Northside"),
      },
      {
        addr: normalizeAddress("136 Carrington St"),
        id: "0023a00002000000",
        hood: normalizeAddress("Central Northside"),
      },
      {
        addr: normalizeAddress("1126 Carrington St"),
        id: "0023a00003000000",
        hood: normalizeAddress("Central Northside"),
      },
    ];
    expect(searchLots(idx, "Forbes").slice(0, 3)).toContain(7);
    expect(searchLots(idx, "forbes squirrel")[0]).toBe(7);
    expect(searchLots(idx, "0 forbes squirrel hill")[0]).toBe(7);
    expect(searchLots(idx, "126 Carrington")[0]).toBe(8);
    expect(searchLots(idx, "L00500")).toEqual([7]);
    expect(searchLots(idx, "Forbes").at(-1)).toBe(4);
  });

  it("finds nothing for nonsense", () => {
    expect(searchLots(index, "zzzz qqq")).toEqual([]);
  });
});
