import { calculateOrderFees } from "@/lib/fees";

export const DEFAULT_CARRYING_INPUTS = Object.freeze({
  inventoryValue: "",
  months: "6",
  liquidationDiscount: "25",
  monthlyStorage: "0",
  monthlyInsurance: "0",
  annualCapitalRate: "0",
  monthlyValueLossRate: "0",
});

export type CarryingCostField = keyof typeof DEFAULT_CARRYING_INPUTS;
export type CarryingCostInputs = Record<CarryingCostField, string>;
type Values = Record<CarryingCostField, number>;
type Errors = Partial<Record<CarryingCostField, string>>;

function decimal(value: string): number | null {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text.replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

/** Query data is untrusted and uses the same validation as edited inputs. */
export function carryingCostInputsFromQuery(
  query: Record<string, string | string[] | undefined>,
): CarryingCostInputs {
  const inputs: CarryingCostInputs = { ...DEFAULT_CARRYING_INPUTS };
  for (const field of Object.keys(inputs) as CarryingCostField[]) {
    const value = query[field];
    if (value !== undefined) {
      inputs[field] =
        typeof value !== "string"
          ? "Repeated value"
          : value.length > 80
            ? "Value is too long"
            : value;
    }
  }
  return inputs;
}

function estimatedSale(gross: number) {
  const roundedGross = Math.round(gross * 100) / 100;
  // A zero-dollar scenario is no sale, not a processed zero-dollar order.
  if (roundedGross === 0)
    return { gross: 0, sellerFee: 0, processingFee: 0, net: 0 };
  const fees = calculateOrderFees(roundedGross, 0);
  return {
    gross: roundedGross,
    sellerFee: fees.sellerFee,
    processingFee: fees.sellerStripeFee,
    net: fees.sellerPayout,
  };
}

/** One unsold lot, one hypothetical sale. No forecast, tax or fee-policy mutation. */
export function calculateCarryingCost(inputs: CarryingCostInputs) {
  const values = {} as Values;
  const errors: Errors = {};
  for (const field of Object.keys(
    DEFAULT_CARRYING_INPUTS,
  ) as CarryingCostField[]) {
    const value = decimal(inputs[field]);
    const isMonth = field === "months";
    const isMoney = [
      "inventoryValue",
      "monthlyStorage",
      "monthlyInsurance",
    ].includes(field);
    const maximum = isMonth ? 24 : isMoney ? 1_000_000_000 : 100;
    if (field === "inventoryValue" && inputs[field].trim() === "") {
      values[field] = 0;
    } else if (
      value === null ||
      value < (isMonth ? 1 : 0) ||
      value > maximum ||
      (isMonth && !Number.isInteger(value))
    ) {
      errors[field] = isMonth
        ? "Choose a whole number from 1 to 24 months."
        : isMoney
          ? "Enter an amount from 0 to 1,000,000,000 using digits and optional commas."
          : "Enter a percentage from 0 to 100.";
    } else {
      values[field] = value;
    }
  }
  if (Object.keys(errors).length) return { status: "invalid" as const, errors };
  if (values.inventoryValue === 0) return { status: "empty" as const, errors };

  let endingValue = values.inventoryValue;
  let capitalCost = 0;
  for (let month = 0; month < values.months; month++) {
    capitalCost += (endingValue * values.annualCapitalRate) / 100 / 12;
    endingValue *= 1 - values.monthlyValueLossRate / 100;
  }
  const cashCosts =
    (values.monthlyStorage + values.monthlyInsurance) * values.months;
  const valueLoss = values.inventoryValue - endingValue;
  const saleFraction = 1 - values.liquidationDiscount / 100;
  const sellNow = estimatedSale(values.inventoryValue * saleFraction);
  const sellLater = estimatedSale(endingValue * saleFraction);
  const holdNet = sellLater.net - cashCosts - capitalCost;
  const difference = sellNow.net - holdNet;
  return {
    status: "ready" as const,
    errors,
    values,
    endingValue,
    cashCosts,
    capitalCost,
    valueLoss,
    sellNow,
    sellLater,
    holdNet,
    difference,
  };
}
