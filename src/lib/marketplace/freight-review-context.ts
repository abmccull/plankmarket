export interface FreightReviewServices { liftgateDelivery: boolean; residentialDelivery: boolean; appointmentDelivery: boolean }
const names = { liftgateDelivery: "freightLiftgate", residentialDelivery: "freightResidential", appointmentDelivery: "freightAppointment" } as const;
export function freightReviewServicesFromParams(params: Pick<URLSearchParams, "getAll">): FreightReviewServices {
  const read = (name: string) => { const values = params.getAll(name); return values.length === 1 && values[0] === "1"; };
  return { liftgateDelivery: read(names.liftgateDelivery), residentialDelivery: read(names.residentialDelivery), appointmentDelivery: read(names.appointmentDelivery) };
}
export function withFreightReviewServices(path: string, services: FreightReviewServices): string {
  const url = new URL(path, "https://marketplace.invalid");
  for (const key of Object.keys(names) as (keyof FreightReviewServices)[]) {
    url.searchParams.delete(names[key]);
    url.searchParams.set(names[key], services[key] ? "1" : "0");
  }
  return url.pathname + url.search + url.hash;
}
