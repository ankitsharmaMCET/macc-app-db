/* Catalog field helpers & getters */

export const getUnitPrice = (row) => (row?.price ?? row?.price_per_unit_inr ?? 0);
export const getEFperUnit = (row) => (row?.ef_tco2_per_unit ?? row?.ef_t_per_unit ?? 0);
export const getElecPricePerMWh = (row) => (row?.price_per_mwh ?? row?.price_per_mwh_inr ?? 5000);
export const getElecEFperMWh = (row) => (row?.ef_tco2_per_mwh ?? 0.710);

// Normalize fuels/raw/transport/waste rows
export function normalizeFRTW(row) {
  return {
    name: row.name ?? row.fuel ?? row.material ?? row.transport ?? row.item ?? "",
    unit: row.unit ?? "",
    price_per_unit_inr: Number(row.price_per_unit_inr ?? row.price_per_unit ?? row.price ?? 0),
    ef_tco2_per_unit: Number(row.ef_tco2_per_unit ?? row.ef_t_per_unit ?? row.ef_t ?? 0),
  };
}

// Normalize electricity rows
export function normalizeElec(row) {
  return {
    state: row.state ?? row.region ?? row.grid ?? "",
    price_per_mwh_inr: Number(row.price_per_mwh_inr ?? row.price_per_mwh ?? row.price ?? 0),
    ef_tco2_per_mwh: Number(row.ef_tco2_per_mwh ?? row.ef_t_per_mwh ?? row.ef_t ?? 0.710),
  };
}