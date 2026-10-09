import {describe,expect,it} from "vitest";
import {canPurchase,canCreateListings} from "../roles";
describe("buying and selling authority",()=>{it.each(["buyer","seller","admin"] as const)("allows %s accounts to buy",role=>expect(canPurchase(role)).toBe(true));it("keeps seller creation unavailable to buyer-only authority",()=>expect(canCreateListings("buyer")).toBe(false));});
