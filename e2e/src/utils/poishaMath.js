/**
 * PrintFlow Poisha Currency & Pricing Math Engine
 *
 * Implements Locked Architectural Decisions #1 & #2:
 * - 1 BDT = 100 Poisha (stored as unsigned integers, avoiding float rounding)
 * - Dynamic Duplex (both-sided) pricing rules (Model A & Model B)
 * - Odd-page distribution handling
 * - Bangla numeral formatting
 */

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/**
 * Converts decimal BDT string or number to integer Poisha.
 * Avoids IEEE-754 floating-point inaccuracies (e.g., 0.1 + 0.2).
 *
 * @param {string|number} bdtAmount
 * @returns {number} Integer Poisha
 */
export function toPoisha(bdtAmount) {
  if (bdtAmount === null || bdtAmount === undefined) {
    return 0;
  }

  const str = String(bdtAmount).trim();
  if (!str) return 0;

  // Handle negative or zero
  const isNegative = str.startsWith('-');
  const clean = isNegative ? str.slice(1) : str;

  const parts = clean.split('.');
  const wholePart = parseInt(parts[0] || '0', 10);
  const fractionPart = (parts[1] || '').padEnd(2, '0').slice(0, 2);
  const poisha = wholePart * 100 + parseInt(fractionPart, 10);

  return isNegative ? -poisha : poisha;
}

/**
 * Converts integer Poisha to decimal BDT number.
 * @param {number|bigint} poisha
 * @returns {number} Decimal BDT
 */
export function fromPoisha(poisha) {
  return Number(poisha) / 100;
}

/**
 * Formats Poisha into human-readable BDT string.
 * @param {number|bigint} poisha
 * @param {object} options
 * @param {boolean} [options.includeSymbol=true] Whether to include the BDT currency symbol (৳)
 * @param {boolean} [options.bangla=false] Whether to format using Bangla numerals (৳১২.৫০)
 * @returns {string} Formatted string
 */
export function formatBdt(poisha, { includeSymbol = true, bangla = false } = {}) {
  const p = Number(poisha || 0);
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(p);
  const taka = Math.floor(abs / 100);
  const paisa = String(abs % 100).padStart(2, '0');

  let formatted = `${sign}${taka}.${paisa}`;

  if (bangla) {
    formatted = toBanglaDigits(formatted);
  }

  const symbol = includeSymbol ? (bangla ? '৳' : '৳') : '';
  return `${symbol}${formatted}`;
}

/**
 * Converts ASCII digits to Bangla numerals.
 * @param {string|number} input
 * @returns {string}
 */
export function toBanglaDigits(input) {
  return String(input).replace(/[0-9]/g, (digit) => BANGLA_DIGITS[parseInt(digit, 10)]);
}

/**
 * Converts Bangla numerals to ASCII digits.
 * @param {string} input
 * @returns {string}
 */
export function fromBanglaDigits(input) {
  return String(input).replace(/[০-৯]/g, (bDigit) => {
    const idx = BANGLA_DIGITS.indexOf(bDigit);
    return idx !== -1 ? String(idx) : bDigit;
  });
}

/**
 * Calculates dynamic duplex pricing with deterministic odd-page handling.
 *
 * @param {object} params
 * @param {number} params.totalPages Total pages in the document
 * @param {'simplex'|'duplex'} [params.mode='duplex'] Print mode
 * @param {'model_a'|'model_b'} [params.duplexModel='model_b'] Model A: Flat sheet fee, Model B: Discounted side rate
 * @param {number} params.baseSimplexSideRatePoisha Base rate per printed side in Poisha (e.g. 200 = ৳2.00)
 * @param {number} [params.duplexSecondSideRatePoisha] Model B: explicit second side rate in Poisha
 * @param {number} [params.duplexDiscountPercent=0] Model B: % discount on second side (e.g. 20 for 20% discount)
 * @param {number} [params.flatDuplexSheetRatePoisha] Model A: Flat fee per duplex sheet in Poisha
 * @param {number} [params.copies=1] Number of copies
 * @returns {object} Breakdown of sheets, sides, unit rates, and totals in Poisha
 */
export function calculateDynamicDuplex({
  totalPages,
  mode = 'duplex',
  duplexModel = 'model_b',
  baseSimplexSideRatePoisha,
  duplexSecondSideRatePoisha,
  duplexDiscountPercent = 0,
  flatDuplexSheetRatePoisha,
  copies = 1,
}) {
  if (totalPages <= 0 || copies <= 0) {
    return {
      totalPages: 0,
      copies: 0,
      totalSheets: 0,
      totalSides: 0,
      duplexSheets: 0,
      simplexSheets: 0,
      subtotalPoisha: 0,
      totalPoisha: 0,
      lineItems: [],
    };
  }

  const baseRate = Math.round(Number(baseSimplexSideRatePoisha || 0));

  if (mode === 'simplex') {
    // Every page is 1 sheet and 1 printed side
    const totalSheetsPerCopy = totalPages;
    const totalSidesPerCopy = totalPages;
    const unitPricePoisha = baseRate * totalPages;
    const subtotalPoisha = unitPricePoisha * copies;

    return {
      mode: 'simplex',
      totalPages,
      copies,
      sheetsPerCopy: totalSheetsPerCopy,
      totalSheets: totalSheetsPerCopy * copies,
      totalSides: totalSidesPerCopy * copies,
      duplexSheets: 0,
      simplexSheets: totalSheetsPerCopy * copies,
      subtotalPoisha,
      totalPoisha: subtotalPoisha,
      lineItems: [
        {
          description: `Simplex Print (${totalPages} pages @ ${formatBdt(baseRate)}/side)`,
          quantity: totalPages * copies,
          unitRatePoisha: baseRate,
          totalPoisha: subtotalPoisha,
        },
      ],
    };
  }

  // Duplex Mode:
  // Odd-page handling: e.g. 5 pages -> 2 duplex sheets (4 sides) + 1 simplex sheet (1 side)
  const duplexSheetsPerCopy = Math.floor(totalPages / 2);
  const oddPageCount = totalPages % 2; // 0 or 1
  const simplexSheetsPerCopy = oddPageCount;
  const totalSheetsPerCopy = duplexSheetsPerCopy + simplexSheetsPerCopy;

  let costPerCopyPoisha = 0;
  const lineItems = [];

  if (duplexModel === 'model_a') {
    // Model A: Flat fee per duplex sheet, plus simplex fee for odd page
    const sheetRate = flatDuplexSheetRatePoisha !== undefined
      ? flatDuplexSheetRatePoisha
      : Math.round(baseRate * 1.8); // Default fallback 1.8x base rate

    const duplexCost = duplexSheetsPerCopy * sheetRate;
    const oddCost = simplexSheetsPerCopy * baseRate;
    costPerCopyPoisha = duplexCost + oddCost;

    if (duplexSheetsPerCopy > 0) {
      lineItems.push({
        description: `Duplex Sheets (${duplexSheetsPerCopy} sheets @ ${formatBdt(sheetRate)}/sheet)`,
        quantity: duplexSheetsPerCopy * copies,
        unitRatePoisha: sheetRate,
        totalPoisha: duplexCost * copies,
      });
    }

    if (simplexSheetsPerCopy > 0) {
      lineItems.push({
        description: `Odd Page Simplex Sheet (1 sheet @ ${formatBdt(baseRate)}/side)`,
        quantity: simplexSheetsPerCopy * copies,
        unitRatePoisha: baseRate,
        totalPoisha: oddCost * copies,
      });
    }
  } else {
    // Model B: Discounted side rate on back side
    // Front sides (duplexSheetsPerCopy) at baseRate
    // Back sides (duplexSheetsPerCopy) at discounted rate
    // Odd page (simplexSheetsPerCopy) at baseRate
    let secondSideRate = duplexSecondSideRatePoisha;
    if (secondSideRate === undefined) {
      const discountFactor = (100 - duplexDiscountPercent) / 100;
      secondSideRate = Math.round(baseRate * discountFactor);
    }

    const frontSideCost = duplexSheetsPerCopy * baseRate;
    const backSideCost = duplexSheetsPerCopy * secondSideRate;
    const oddSideCost = simplexSheetsPerCopy * baseRate;

    costPerCopyPoisha = frontSideCost + backSideCost + oddSideCost;

    if (duplexSheetsPerCopy > 0) {
      lineItems.push({
        description: `Duplex Front Sides (${duplexSheetsPerCopy} sides @ ${formatBdt(baseRate)}/side)`,
        quantity: duplexSheetsPerCopy * copies,
        unitRatePoisha: baseRate,
        totalPoisha: frontSideCost * copies,
      });
      lineItems.push({
        description: `Duplex Back Sides (${duplexSheetsPerCopy} sides @ ${formatBdt(secondSideRate)}/side)`,
        quantity: duplexSheetsPerCopy * copies,
        unitRatePoisha: secondSideRate,
        totalPoisha: backSideCost * copies,
      });
    }

    if (simplexSheetsPerCopy > 0) {
      lineItems.push({
        description: `Odd Page Simplex Side (1 side @ ${formatBdt(baseRate)}/side)`,
        quantity: simplexSheetsPerCopy * copies,
        unitRatePoisha: baseRate,
        totalPoisha: oddSideCost * copies,
      });
    }
  }

  const subtotalPoisha = costPerCopyPoisha * copies;

  return {
    mode: 'duplex',
    duplexModel,
    totalPages,
    copies,
    sheetsPerCopy: totalSheetsPerCopy,
    totalSheets: totalSheetsPerCopy * copies,
    totalSides: totalPages * copies,
    duplexSheets: duplexSheetsPerCopy * copies,
    simplexSheets: simplexSheetsPerCopy * copies,
    costPerCopyPoisha,
    subtotalPoisha,
    totalPoisha: subtotalPoisha,
    lineItems,
  };
}

/**
 * Calculates VAT, floor price adjustment, service fees, and final order total in Poisha.
 *
 * @param {object} params
 * @param {number} params.subtotalPoisha Raw subtotal in Poisha
 * @param {number} [params.vatBasisPoints=0] VAT in basis points (500 = 5.00%, 1500 = 15.00%)
 * @param {number} [params.minimumOrderFloorPoisha=0] Minimum floor threshold in Poisha (e.g. 500 = ৳5.00)
 * @param {number} [params.serviceFeePoisha=0] Additional flat service fee in Poisha
 * @returns {object} Calculated tax, adjustments, and final total in Poisha
 */
export function calculateTaxAndTotal({
  subtotalPoisha,
  vatBasisPoints = 0,
  minimumOrderFloorPoisha = 0,
  serviceFeePoisha = 0,
}) {
  const subtotal = Math.max(0, Math.round(Number(subtotalPoisha || 0)));
  const serviceFee = Math.max(0, Math.round(Number(serviceFeePoisha || 0)));
  const floor = Math.max(0, Math.round(Number(minimumOrderFloorPoisha || 0)));

  // Calculate floor adjustment
  let floorAdjustmentPoisha = 0;
  let effectiveSubtotal = subtotal;

  if (effectiveSubtotal < floor) {
    floorAdjustmentPoisha = floor - effectiveSubtotal;
    effectiveSubtotal = floor;
  }

  // Calculate VAT based on basis points (1 bp = 0.01% = 1/10000)
  // VAT applies to effective subtotal + service fee
  const taxableAmount = effectiveSubtotal + serviceFee;
  const vatPoisha = Math.round((taxableAmount * vatBasisPoints) / 10000);

  const totalPoisha = taxableAmount + vatPoisha;

  return {
    subtotalPoisha: subtotal,
    floorAdjustmentPoisha,
    serviceFeePoisha: serviceFee,
    vatBasisPoints,
    vatPoisha,
    totalPoisha,
  };
}
