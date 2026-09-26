import type { LotsFile } from "./types";

// Sample of real City-owned vacant lots (WPRDC city-owned-properties) with
// synthetic frontage, land value, and hazard flags. Used only when
// /data/lots.json is unavailable.
export const FIXTURE_LOTS: LotsFile = {
  "generatedAt": "fixture",
  "sources": [
    {
      "name": "City of Pittsburgh City-Owned Properties (sample)",
      "url": "https://data.wprdc.org/dataset/city-owned-properties",
      "vintage": "fixture"
    }
  ],
  "lots": [
    {
      "id": "0046E00006000000",
      "address": "2619 Charles N St",
      "neighborhood": "Perry South",
      "councilDistrict": "6",
      "lat": 40.468353,
      "lon": -80.015522,
      "zone": "H",
      "lotAreaSqFt": 6000,
      "frontageFt": 33,
      "landValue": null,
      "status": "Hold for Study",
      "inventoryType": "Hold For Study",
      "hazards": {
        "steepSlope": false,
        "undermined": true,
        "floodZone": false
      }
    },
    {
      "id": "0056D00363000000",
      "address": "0547 Colchester St",
      "neighborhood": "Hazelwood",
      "councilDistrict": "5",
      "lat": 40.412094,
      "lon": -79.933384,
      "zone": "H",
      "lotAreaSqFt": 1600,
      "frontageFt": 50,
      "landValue": 6400,
      "status": "Permanent City Ownership",
      "inventoryType": "Greenway",
      "hazards": {
        "steepSlope": false,
        "undermined": true,
        "floodZone": null
      }
    },
    {
      "id": "0046B00191000000",
      "address": "14 Ellzey St",
      "neighborhood": "Perry South",
      "councilDistrict": "6",
      "lat": 40.471391,
      "lon": -80.010203,
      "zone": "RM-M",
      "lotAreaSqFt": 1875,
      "frontageFt": 30,
      "landValue": 1200,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": null
      }
    },
    {
      "id": "0174J00323000000",
      "address": "7127 Bennett St",
      "neighborhood": "Homewood South",
      "councilDistrict": "9",
      "lat": 40.45697,
      "lon": -79.897712,
      "zone": "RM-M",
      "lotAreaSqFt": 3375,
      "frontageFt": null,
      "landValue": null,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0174P00176000000",
      "address": "7343 Hamilton Ave",
      "neighborhood": "Homewood South",
      "councilDistrict": "9",
      "lat": 40.453982,
      "lon": -79.893866,
      "zone": "RM-M",
      "lotAreaSqFt": 1232,
      "frontageFt": 30,
      "landValue": 3800,
      "status": "Sale Pending",
      "inventoryType": "PLB Transfer",
      "hazards": {
        "steepSlope": false,
        "undermined": true,
        "floodZone": null
      }
    },
    {
      "id": "0077R00053000000",
      "address": "2714 Hazelton St",
      "neighborhood": "Perry South",
      "councilDistrict": "6",
      "lat": 40.473049,
      "lon": -80.007277,
      "zone": "H",
      "lotAreaSqFt": 2000,
      "frontageFt": 40,
      "landValue": 1200,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0042N00044000000",
      "address": "3244 Chartiers Ave",
      "neighborhood": "Sheraden",
      "councilDistrict": "2",
      "lat": 40.454192,
      "lon": -80.066078,
      "zone": "P",
      "lotAreaSqFt": 16730,
      "frontageFt": 30,
      "landValue": 2500,
      "status": "Permanent City Ownership",
      "inventoryType": "Park",
      "hazards": {
        "steepSlope": true,
        "undermined": false,
        "floodZone": true
      }
    },
    {
      "id": "0174P00344000000",
      "address": "7323 Kelly St",
      "neighborhood": "Homewood South",
      "councilDistrict": "9",
      "lat": 40.45511,
      "lon": -79.894031,
      "zone": "RM-M",
      "lotAreaSqFt": 3375,
      "frontageFt": 25,
      "landValue": 5000,
      "status": "Sale Pending",
      "inventoryType": "PLB Transfer",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0046K00193000000",
      "address": "299 Lafayette Ave",
      "neighborhood": "Perry South",
      "councilDistrict": "6",
      "lat": 40.465686,
      "lon": -80.008,
      "zone": "R1D-H",
      "lotAreaSqFt": 525,
      "frontageFt": 40,
      "landValue": null,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": true,
        "undermined": false,
        "floodZone": true
      }
    },
    {
      "id": "0056D00382000000",
      "address": "0532 Colchester St",
      "neighborhood": "Hazelwood",
      "councilDistrict": "5",
      "lat": 40.411838,
      "lon": -79.933116,
      "zone": "H",
      "lotAreaSqFt": 1180,
      "frontageFt": 50,
      "landValue": 12500,
      "status": "Permanent City Ownership",
      "inventoryType": "Greenway",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0055K00010000000",
      "address": "4307 Monongahela St",
      "neighborhood": "Hazelwood",
      "councilDistrict": "5",
      "lat": 40.416687,
      "lon": -79.94513,
      "zone": "H",
      "lotAreaSqFt": 2500,
      "frontageFt": null,
      "landValue": 2500,
      "status": "Hold for Study",
      "inventoryType": "Hold For Study",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": null
      }
    },
    {
      "id": "0125H00079000000",
      "address": "1010 Gerritt St",
      "neighborhood": "Homewood West",
      "councilDistrict": "9",
      "lat": 40.460025,
      "lon": -79.90138,
      "zone": "R2-L",
      "lotAreaSqFt": 2760,
      "frontageFt": 40,
      "landValue": 12500,
      "status": "Sale Pending",
      "inventoryType": "PLB Transfer",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": true
      }
    },
    {
      "id": "0124F00220000000",
      "address": "24 Orphan St",
      "neighborhood": "Larimer",
      "councilDistrict": "9",
      "lat": 40.467758,
      "lon": -79.91014,
      "zone": "H",
      "lotAreaSqFt": 1376,
      "frontageFt": 40,
      "landValue": 3800,
      "status": "Hold for Study",
      "inventoryType": "URA Transfer",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0021N00214000000",
      "address": "2627 Stafford St",
      "neighborhood": "Sheraden",
      "councilDistrict": "2",
      "lat": 40.453489,
      "lon": -80.046525,
      "zone": "H",
      "lotAreaSqFt": 2040,
      "frontageFt": 30,
      "landValue": 6400,
      "status": "Hold for Study",
      "inventoryType": "Hold For Study",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0125H00177000000",
      "address": "7023 Idelwild St",
      "neighborhood": "Homewood North",
      "councilDistrict": "9",
      "lat": 40.459443,
      "lon": -79.899586,
      "zone": "R2-L",
      "lotAreaSqFt": 3500,
      "frontageFt": 50,
      "landValue": null,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": true
      }
    },
    {
      "id": "0015M00166000000",
      "address": "416 Sylvania Ave",
      "neighborhood": "Beltzhoover",
      "councilDistrict": "3",
      "lat": 40.417195,
      "lon": -79.999621,
      "zone": "R2-H",
      "lotAreaSqFt": 2575,
      "frontageFt": 30,
      "landValue": 12500,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0174A00307000000",
      "address": "7032 Hermitage St",
      "neighborhood": "Homewood North",
      "councilDistrict": "9",
      "lat": 40.460745,
      "lon": -79.898888,
      "zone": "R2-L",
      "lotAreaSqFt": 3500,
      "frontageFt": 30,
      "landValue": 12500,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": true,
        "floodZone": true
      }
    },
    {
      "id": "0174L00059000000",
      "address": "7413 Frankstown Ave",
      "neighborhood": "Homewood North",
      "councilDistrict": "9",
      "lat": 40.456464,
      "lon": -79.891125,
      "zone": "RM-M",
      "lotAreaSqFt": 3000,
      "frontageFt": 50,
      "landValue": null,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0042D00237000000",
      "address": "0 Florien St",
      "neighborhood": "Esplen",
      "councilDistrict": "2",
      "lat": 40.461624,
      "lon": -80.052188,
      "zone": "R1D-H",
      "lotAreaSqFt": 2656,
      "frontageFt": 30,
      "landValue": 9000,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0046N00165000000",
      "address": "416 Holyoke St",
      "neighborhood": "Perry South",
      "councilDistrict": "6",
      "lat": 40.463354,
      "lon": -80.014567,
      "zone": "R1D-H",
      "lotAreaSqFt": 225,
      "frontageFt": 30,
      "landValue": 2500,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": true,
        "floodZone": null
      }
    },
    {
      "id": "0014E00019000000",
      "address": "430 Climax St",
      "neighborhood": "Beltzhoover",
      "councilDistrict": "3",
      "lat": 40.419818,
      "lon": -79.999331,
      "zone": "R2-H",
      "lotAreaSqFt": 2752,
      "frontageFt": null,
      "landValue": 3800,
      "status": "Sale Pending",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0014J00049000000",
      "address": "421 Jucunda St",
      "neighborhood": "Knoxville",
      "councilDistrict": "3",
      "lat": 40.417365,
      "lon": -79.996267,
      "zone": "R1D-H",
      "lotAreaSqFt": 2500,
      "frontageFt": 30,
      "landValue": 5000,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0124F00200000000",
      "address": "634 Whittier St",
      "neighborhood": "Larimer",
      "councilDistrict": "9",
      "lat": 40.467411,
      "lon": -79.910832,
      "zone": "R1D-H",
      "lotAreaSqFt": 5734,
      "frontageFt": 33,
      "landValue": 1200,
      "status": "Hold for Study",
      "inventoryType": "URA Transfer",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0174K00361000000",
      "address": "712 Sterrett St",
      "neighborhood": "Homewood South",
      "councilDistrict": "9",
      "lat": 40.45552,
      "lon": -79.894496,
      "zone": "RM-M",
      "lotAreaSqFt": 867,
      "frontageFt": 50,
      "landValue": 3800,
      "status": "Sale Pending",
      "inventoryType": "PLB Transfer",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": true
      }
    },
    {
      "id": "0174L00246000000",
      "address": "Baxter St",
      "neighborhood": "Homewood North",
      "councilDistrict": "9",
      "lat": 40.456398,
      "lon": -79.888864,
      "zone": "RM-M",
      "lotAreaSqFt": 447,
      "frontageFt": 30,
      "landValue": null,
      "status": "Hold for Study",
      "inventoryType": "Hold For Study",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": true
      }
    },
    {
      "id": "0174A00121000000",
      "address": "7023 Kedron St",
      "neighborhood": "Homewood North",
      "councilDistrict": "9",
      "lat": 40.461894,
      "lon": -79.898838,
      "zone": "R2-L",
      "lotAreaSqFt": 1860,
      "frontageFt": 50,
      "landValue": 6400,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0055J00168000000",
      "address": "4415 Chatsworth St",
      "neighborhood": "Hazelwood",
      "councilDistrict": "5",
      "lat": 40.41692,
      "lon": -79.946282,
      "zone": "R1D-H",
      "lotAreaSqFt": 2754,
      "frontageFt": 25,
      "landValue": 2500,
      "status": "Hold for Study",
      "inventoryType": "Hold For Study",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": true
      }
    },
    {
      "id": "0124K00274000000",
      "address": "630 Paulson Av",
      "neighborhood": "Larimer",
      "councilDistrict": "9",
      "lat": 40.465133,
      "lon": -79.909147,
      "zone": "R1D-H",
      "lotAreaSqFt": 2750,
      "frontageFt": 40,
      "landValue": 12500,
      "status": "Hold for Study",
      "inventoryType": "URA Transfer",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0056F00271000000",
      "address": "190 Flowers Ave",
      "neighborhood": "Hazelwood",
      "councilDistrict": "5",
      "lat": 40.410877,
      "lon": -79.941581,
      "zone": "R1A-H",
      "lotAreaSqFt": 3352,
      "frontageFt": 50,
      "landValue": 1200,
      "status": "Hold for Study",
      "inventoryType": "Hold for Study",
      "hazards": {
        "steepSlope": true,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0015H00300000000",
      "address": "171 Haberman Av",
      "neighborhood": "Beltzhoover",
      "councilDistrict": "3",
      "lat": 40.42073,
      "lon": -80.002255,
      "zone": "LNC",
      "lotAreaSqFt": 1600,
      "frontageFt": 33,
      "landValue": 6400,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": true,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0174A00355000000",
      "address": "7034 Fletcher Way",
      "neighborhood": "Homewood North",
      "councilDistrict": "9",
      "lat": 40.460384,
      "lon": -79.898935,
      "zone": "R2-L",
      "lotAreaSqFt": 1561,
      "frontageFt": 50,
      "landValue": 2500,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": true
      }
    },
    {
      "id": "0124S00296000000",
      "address": "0 Upland St",
      "neighborhood": "Homewood West",
      "councilDistrict": "9",
      "lat": 40.463461,
      "lon": -79.899687,
      "zone": "R2-L",
      "lotAreaSqFt": 2000,
      "frontageFt": 30,
      "landValue": 9000,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": true
      }
    },
    {
      "id": "0015M00239000000",
      "address": "311 Chalfont St",
      "neighborhood": "Beltzhoover",
      "councilDistrict": "3",
      "lat": 40.416828,
      "lon": -80.001767,
      "zone": "R2-H",
      "lotAreaSqFt": 3844,
      "frontageFt": 30,
      "landValue": 2500,
      "status": "Available for Sale",
      "inventoryType": "URA Transfer",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0125D00174000000",
      "address": "1215 N Murtland St",
      "neighborhood": "Homewood West",
      "councilDistrict": "9",
      "lat": 40.461839,
      "lon": -79.900083,
      "zone": "R2-L",
      "lotAreaSqFt": 1800,
      "frontageFt": 25,
      "landValue": 5000,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": true,
        "floodZone": false
      }
    },
    {
      "id": "0014E00021000000",
      "address": "440 Climax St",
      "neighborhood": "Beltzhoover",
      "councilDistrict": "3",
      "lat": 40.419815,
      "lon": -79.999013,
      "zone": "R2-H",
      "lotAreaSqFt": 1875,
      "frontageFt": 40,
      "landValue": 12500,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": null
      }
    },
    {
      "id": "0056K00274000000",
      "address": "129 29 Tecumseh St",
      "neighborhood": "Hazelwood",
      "councilDistrict": "5",
      "lat": 40.408962,
      "lon": -79.942565,
      "zone": "R1D-M",
      "lotAreaSqFt": 2000,
      "frontageFt": 33,
      "landValue": 1200,
      "status": "Hold for Study",
      "inventoryType": "Hold for Study",
      "hazards": {
        "steepSlope": true,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0174H00296000000",
      "address": "1056 Mohler St",
      "neighborhood": "Homewood North",
      "councilDistrict": "9",
      "lat": 40.458001,
      "lon": -79.885174,
      "zone": "P",
      "lotAreaSqFt": 2520,
      "frontageFt": 50,
      "landValue": null,
      "status": "Hold for Study",
      "inventoryType": "Hold For Study",
      "hazards": {
        "steepSlope": true,
        "undermined": false,
        "floodZone": null
      }
    },
    {
      "id": "0015H00163000000",
      "address": "414 Climax St",
      "neighborhood": "Beltzhoover",
      "councilDistrict": "3",
      "lat": 40.419721,
      "lon": -79.999697,
      "zone": "R2-H",
      "lotAreaSqFt": 3175,
      "frontageFt": 30,
      "landValue": 2500,
      "status": "Available for Sale",
      "inventoryType": "URA Transfer",
      "hazards": {
        "steepSlope": true,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0015M00254000000",
      "address": "345 Chalfont St",
      "neighborhood": "Beltzhoover",
      "councilDistrict": "3",
      "lat": 40.416845,
      "lon": -80.000623,
      "zone": "R2-H",
      "lotAreaSqFt": 2562,
      "frontageFt": 33,
      "landValue": 6400,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0055L00069000000",
      "address": "559 61 Hazelwood Ave",
      "neighborhood": "Hazelwood",
      "councilDistrict": "5",
      "lat": 40.417391,
      "lon": -79.937812,
      "zone": "P",
      "lotAreaSqFt": 9117,
      "frontageFt": 33,
      "landValue": null,
      "status": "Hold for Study",
      "inventoryType": "Hold for Study",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0015H00225000000",
      "address": "14 Vincent St",
      "neighborhood": "Beltzhoover",
      "councilDistrict": "3",
      "lat": 40.420404,
      "lon": -80.001719,
      "zone": "LNC",
      "lotAreaSqFt": 2563,
      "frontageFt": 25,
      "landValue": null,
      "status": "Available for Sale",
      "inventoryType": "URA Transfer",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0056L00339000000",
      "address": "5035 Ampere St",
      "neighborhood": "Hazelwood",
      "councilDistrict": "5",
      "lat": 40.408664,
      "lon": -79.937997,
      "zone": "R1D-M",
      "lotAreaSqFt": 2500,
      "frontageFt": 33,
      "landValue": 6400,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": true
      }
    },
    {
      "id": "0124N00193000000",
      "address": "171 Carver St",
      "neighborhood": "Larimer",
      "councilDistrict": "9",
      "lat": 40.463219,
      "lon": -79.913136,
      "zone": "R2-H",
      "lotAreaSqFt": 2300,
      "frontageFt": 30,
      "landValue": 12500,
      "status": "Available for Sale",
      "inventoryType": "URA Transfer",
      "hazards": {
        "steepSlope": false,
        "undermined": true,
        "floodZone": false
      }
    },
    {
      "id": "0045S00250000000",
      "address": "827 Melrose Ave",
      "neighborhood": "Perry South",
      "councilDistrict": "6",
      "lat": 40.462459,
      "lon": -80.018125,
      "zone": "R1A-VH",
      "lotAreaSqFt": 3300,
      "frontageFt": 50,
      "landValue": 6400,
      "status": "Available for Sale",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": true,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0124S00176000000",
      "address": "912 Lincoln Ave",
      "neighborhood": "Homewood West",
      "councilDistrict": "9",
      "lat": 40.463583,
      "lon": -79.902311,
      "zone": "LNC",
      "lotAreaSqFt": 3465,
      "frontageFt": 25,
      "landValue": 1200,
      "status": "Hold for Study",
      "inventoryType": "Hold for Study",
      "hazards": {
        "steepSlope": true,
        "undermined": false,
        "floodZone": null
      }
    },
    {
      "id": "0056F00296000000",
      "address": "139 Flowers Ave",
      "neighborhood": "Hazelwood",
      "councilDistrict": "5",
      "lat": 40.410381,
      "lon": -79.942931,
      "zone": "R1A-H",
      "lotAreaSqFt": 567,
      "frontageFt": null,
      "landValue": 6400,
      "status": "Hold for Study",
      "inventoryType": "Hold for Study",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": null
      }
    },
    {
      "id": "0056R00150000000",
      "address": "249 Mansion St",
      "neighborhood": "Hazelwood",
      "councilDistrict": "5",
      "lat": 40.40453,
      "lon": -79.939414,
      "zone": "R1A-H",
      "lotAreaSqFt": 2628,
      "frontageFt": 33,
      "landValue": 2500,
      "status": "Sale Pending",
      "inventoryType": "Public Sale",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    },
    {
      "id": "0057C00175000000",
      "address": "5500 Sunnyside St",
      "neighborhood": "Hazelwood",
      "councilDistrict": "5",
      "lat": 40.402165,
      "lon": -79.940041,
      "zone": "R1A-H",
      "lotAreaSqFt": 4036,
      "frontageFt": 25,
      "landValue": 5000,
      "status": "Hold for Study",
      "inventoryType": "Hold for Study",
      "hazards": {
        "steepSlope": false,
        "undermined": false,
        "floodZone": false
      }
    }
  ]
};
