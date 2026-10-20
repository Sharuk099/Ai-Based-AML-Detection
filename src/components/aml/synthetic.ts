/**
 * Documented benchmark transaction generators.
 * Provides realistic class distributions and behavioral signatures covering
 * global banking and Indian banking (UPI, NEFT, RTGS, IMPS, NetBanking, Cheque).
 */

export const AML_CLASSES = [
  "Standard Personal",
  "Commercial & Merchant",
  "Structuring & Smurfing",
  "Mule Pass-Through",
  "Circular Layering",
  "Rapid High-Velocity",
] as const;

export function syntheticCsv(n: number = 3000): string {
  let s = 12345;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const ordinaryAccounts = Array.from(
    { length: 1200 },
    (_, i) => `ACC_${String(i + 1).padStart(5, "0")}`,
  );
  const indianAccounts = Array.from({ length: 600 }, (_, i) => `user_${i + 1}@upi`);
  const merchantAccounts = [
    "RELIANCE_RETAIL_IN",
    "AMAZON_PAY_IN",
    "FLIPKART_SETTLE",
    "DMART_SUPER_IN",
    "TATA_DIGITAL_IN",
    "SWIGGY_SETTLE",
    "ZOMATO_PAY",
    "INDIAN_OIL_CORP",
    "AMAZON_RETAIL_US",
    "WALMART_SETTLE",
    "TARGET_CORP",
    "SHELL_ENERGY",
  ];
  const muleAccounts = Array.from(
    { length: 20 },
    (_, i) => `MULE_${String(i + 1).padStart(3, "0")}`,
  );

  const lines = ["tx_id,from_account,to_account,amount,currency,payment_format,timestamp,label"];
  const baseDate = new Date(Date.UTC(2024, 0, 1, 6, 0, 0));

  for (let i = 0; i < n; i++) {
    const dice = r();
    let from = "";
    let to = "";
    let amount = 0;
    let currency = "USD";
    let paymentFormat = "Card";
    let hour = 9 + Math.floor(r() * 10);
    let label = "Standard Personal";

    const isIndian = r() < 0.45; // 45% Indian banking, 55% international

    if (dice < 0.08) {
      // 8% Structuring / Smurfing (just below regulatory thresholds: ₹50k or $10k)
      label = "Structuring & Smurfing";
      from = isIndian
        ? (indianAccounts[Math.floor(r() * indianAccounts.length)] ?? "")
        : (muleAccounts[Math.floor(r() * muleAccounts.length)] ?? "");
      to = isIndian
        ? (indianAccounts[Math.floor(r() * 100)] ?? "")
        : (ordinaryAccounts[Math.floor(r() * 200)] ?? "");
      if (isIndian) {
        currency = "INR";
        paymentFormat = ["UPI", "IMPS", "Cash", "NEFT"][Math.floor(r() * 4)] ?? "";
        // Indian structuring: ₹48,000 - ₹49,950 (just below ₹50,000 PAN limit) or ₹9,50,000 (CTR limit)
        amount = r() < 0.7 ? 48000 + r() * 1900 : 950000 + r() * 45000;
      } else {
        currency = r() < 0.8 ? "USD" : "EUR";
        paymentFormat = ["Wire", "Cash", "Crypto"][Math.floor(r() * 3)] ?? "";
        // US/EU structuring: $9,200 - $9,950 (just below $10,000 reporting threshold)
        amount = 9200 + r() * 750;
      }
      hour = r() < 0.6 ? Math.floor(r() * 5) : 19 + Math.floor(r() * 5); // off-hours
    } else if (dice < 0.14) {
      // 6% Mule Pass-Through (immediate fund forwarding with matched amounts)
      label = "Mule Pass-Through";
      from = muleAccounts[Math.floor(r() * 10)] ?? "";
      to = muleAccounts[10 + Math.floor(r() * 10)] ?? "";
      if (isIndian) {
        currency = "INR";
        paymentFormat = ["IMPS", "UPI", "NEFT"][Math.floor(r() * 3)] ?? "";
        amount = 150000 + r() * 350000;
      } else {
        currency = "USD";
        paymentFormat = ["Wire", "ACH"][Math.floor(r() * 2)] ?? "";
        amount = 12000 + r() * 25000;
      }
      hour = Math.floor(r() * 24);
    } else if (dice < 0.19) {
      // 5% Circular Layering (multi-hop ring)
      label = "Circular Layering";
      const ringIdx = i % 5;
      from = muleAccounts[ringIdx] ?? "";
      to = muleAccounts[(ringIdx + 1) % 5] ?? "";
      if (isIndian) {
        currency = "INR";
        paymentFormat = ["UPI", "IMPS", "NEFT"][Math.floor(r() * 3)] ?? "";
        amount = 250000 + r() * 100000;
      } else {
        currency = "USD";
        paymentFormat = ["Wire", "Crypto"][Math.floor(r() * 2)] ?? "";
        amount = 18000 + r() * 22000;
      }
      hour = 2 + Math.floor(r() * 4); // Late night layering
    } else if (dice < 0.24) {
      // 5% Rapid High-Velocity Layering
      label = "Rapid High-Velocity";
      from = isIndian
        ? (indianAccounts[Math.floor(r() * indianAccounts.length)] ?? "")
        : (muleAccounts[Math.floor(r() * muleAccounts.length)] ?? "");
      to = isIndian
        ? (indianAccounts[Math.floor(r() * 50)] ?? "")
        : (ordinaryAccounts[Math.floor(r() * 50)] ?? "");
      if (isIndian) {
        currency = "INR";
        paymentFormat = ["UPI", "IMPS"][Math.floor(r() * 2)] ?? "";
        amount = 85000 + r() * 120000;
      } else {
        currency = "USD";
        paymentFormat = ["Wire", "Crypto"][Math.floor(r() * 2)] ?? "";
        amount = 14000 + r() * 30000;
      }
      hour = Math.floor(r() * 24);
    } else if (dice < 0.55) {
      // 31% Commercial & Merchant (Legitimate business/retail sales)
      label = "Commercial & Merchant";
      const merchant = merchantAccounts[Math.floor(r() * merchantAccounts.length)] ?? "";
      const isIndianMerchant = merchant.includes("_IN");
      from = isIndianMerchant
        ? (indianAccounts[Math.floor(r() * indianAccounts.length)] ?? "")
        : (ordinaryAccounts[Math.floor(r() * ordinaryAccounts.length)] ?? "");
      to = merchant;
      if (isIndianMerchant) {
        currency = "INR";
        paymentFormat = ["UPI", "NetBanking", "Card", "Cheque"][Math.floor(r() * 4)] ?? "";
        amount = 250 + Math.exp(4.0 + r() * 3.5); // ₹250 to ₹15,000
      } else {
        currency = r() < 0.8 ? "USD" : "EUR";
        paymentFormat = ["Card", "ACH", "Wire"][Math.floor(r() * 3)] ?? "";
        amount = 35 + Math.exp(3.0 + r() * 3.2); // $35 to $1,500
      }
      hour = 9 + Math.floor(r() * 12);
    } else {
      // 45% Standard Personal (Benign everyday consumer transfers, bills, groceries)
      label = "Standard Personal";
      if (isIndian) {
        currency = "INR";
        from = indianAccounts[Math.floor(r() * indianAccounts.length)] ?? "";
        to = indianAccounts[Math.floor(r() * indianAccounts.length)] ?? "";
        if (from === to)
          to = indianAccounts[(indianAccounts.indexOf(from) + 1) % indianAccounts.length] ?? "";
        paymentFormat = ["UPI", "UPI", "IMPS", "Card", "Cheque"][Math.floor(r() * 5)] ?? "";
        amount = Math.max(50, Math.exp(3.5 + r() * 3.0)); // ₹50 to ₹3,000
      } else {
        currency = r() < 0.85 ? "USD" : "EUR";
        from = ordinaryAccounts[Math.floor(r() * ordinaryAccounts.length)] ?? "";
        to = ordinaryAccounts[Math.floor(r() * ordinaryAccounts.length)] ?? "";
        if (from === to)
          to =
            ordinaryAccounts[(ordinaryAccounts.indexOf(from) + 1) % ordinaryAccounts.length] ?? "";
        paymentFormat = ["Card", "Card", "ACH", "Cheque"][Math.floor(r() * 4)] ?? "";
        amount = Math.max(12.5, Math.exp(2.8 + r() * 2.8)); // $15 to $400
      }
      hour = 8 + Math.floor(r() * 13);
    }

    const txDate = new Date(baseDate.getTime() + i * 45000 + hour * 3600000);
    lines.push(
      [
        `TX_${String(i + 1).padStart(6, "0")}`,
        from,
        to,
        amount.toFixed(2),
        currency,
        paymentFormat,
        txDate.toISOString(),
        label,
      ].join(","),
    );
  }

  return lines.join("\n");
}

/**
 * Realistic Indian Core Banking Transaction Feed.
 * Includes UPI VPAs, IFSC/Account numbers, INR currency, UPI/IMPS/NEFT/RTGS/Cash/Cheque,
 * and realistic Indian AML typologies (UPI rings, PAN structuring, mule accounts).
 */
export function generateIndianBankingCsv(n: number = 5000): string {
  let s = 456789;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const indianBanks = ["SBIN", "HDFC", "ICIC", "PUNB", "UTIB", "KKBK", "BARB"];
  const accounts = Array.from({ length: 800 }, (_, i) => {
    const bank = indianBanks[i % indianBanks.length];
    return `${bank}${String(10000000 + i).slice(1)}`;
  });
  const upiUsers = Array.from({ length: 600 }, (_, i) => {
    const handles = ["okhdfcbank", "okaxis", "paytm", "icici", "ybl", "upi"];
    return `user${i + 1}@${handles[i % handles.length]}`;
  });
  const merchants = [
    "merchant_reliance@hdfcbank",
    "billing_tatasky@icici",
    "swiggy_orders@paytm",
    "zomato_pay@axisbank",
    "amazon_seller_in@okhdfcbank",
    "dmart_pos@sbi",
    "petrol_hpcl@paytm",
    "apollo_pharmacy@icici",
    "tata_cliq@okhdfcbank",
  ];
  const muleRing = [
    "mule_pune_01@upi",
    "mule_mumbai_02@okhdfcbank",
    "mule_delhi_03@paytm",
    "mule_bangalore_04@icici",
    "mule_hyderabad_05@ybl",
  ];

  const lines = [
    "transaction_id,from_account,to_account,amount,currency,payment_format,timestamp,label",
  ];
  const baseDate = new Date(Date.UTC(2024, 2, 1, 5, 0, 0));

  for (let i = 0; i < n; i++) {
    const dice = r();
    let from = "";
    let to = "";
    let amount = 0;
    let paymentFormat = "UPI";
    let hour = 8 + Math.floor(r() * 14);
    let label = "Standard Personal";

    if (dice < 0.05) {
      // 5% Structuring under ₹50,000 PAN reporting threshold
      label = "Structuring & Smurfing";
      from = upiUsers[Math.floor(r() * upiUsers.length)] ?? "";
      to = accounts[Math.floor(r() * 50)] ?? "";
      amount = +(48500 + r() * 1400).toFixed(2); // ₹48,500 - ₹49,900
      paymentFormat = ["UPI", "IMPS", "Cash"][Math.floor(r() * 3)] ?? "";
      hour = r() < 0.5 ? 23 : 3; // Late night
    } else if (dice < 0.09) {
      // 4% Circular Layering Ring across UPI handles
      label = "Circular Layering";
      const hop = i % muleRing.length;
      from = muleRing[hop] ?? "";
      to = muleRing[(hop + 1) % muleRing.length] ?? "";
      amount = +(195000 + r() * 85000).toFixed(2);
      paymentFormat = ["UPI", "IMPS"][Math.floor(r() * 2)] ?? "";
      hour = 1 + Math.floor(r() * 4);
    } else if (dice < 0.13) {
      // 4% Pass-through Mule account
      label = "Mule Pass-Through";
      from = accounts[Math.floor(r() * 20)] ?? "";
      to = accounts[20 + Math.floor(r() * 20)] ?? "";
      amount = +(350000 + r() * 250000).toFixed(2);
      paymentFormat = ["RTGS", "NEFT", "IMPS"][Math.floor(r() * 3)] ?? "";
      hour = 10 + Math.floor(r() * 6);
    } else if (dice < 0.45) {
      // 32% Commercial Merchant / Retail Payments
      label = "Commercial & Merchant";
      from =
        r() < 0.7
          ? (upiUsers[Math.floor(r() * upiUsers.length)] ?? "")
          : (accounts[Math.floor(r() * accounts.length)] ?? "");
      to = merchants[Math.floor(r() * merchants.length)] ?? "";
      amount = +(150 + Math.exp(3.8 + r() * 3.2)).toFixed(2); // ₹150 - ₹12,000
      paymentFormat = ["UPI", "NetBanking", "Card", "IMPS"][Math.floor(r() * 4)] ?? "";
      hour = 9 + Math.floor(r() * 12);
    } else {
      // 55% Standard Personal (Peer-to-peer UPI, rent, family, bills)
      label = "Standard Personal";
      from =
        r() < 0.6
          ? (upiUsers[Math.floor(r() * upiUsers.length)] ?? "")
          : (accounts[Math.floor(r() * accounts.length)] ?? "");
      to =
        r() < 0.6
          ? (upiUsers[Math.floor(r() * upiUsers.length)] ?? "")
          : (accounts[Math.floor(r() * accounts.length)] ?? "");
      if (from === to) to = upiUsers[(upiUsers.indexOf(from) + 1) % upiUsers.length] ?? "";
      amount = +(40 + Math.exp(3.2 + r() * 2.8)).toFixed(2); // ₹40 - ₹2,500
      paymentFormat = ["UPI", "UPI", "IMPS", "Card", "Cheque"][Math.floor(r() * 5)] ?? "";
      hour = 7 + Math.floor(r() * 15);
    }

    const txDate = new Date(baseDate.getTime() + i * 35000 + hour * 3600000);
    lines.push(
      [
        `IN_TXN_${String(i + 1).padStart(7, "0")}`,
        from,
        to,
        amount.toFixed(2),
        "INR",
        paymentFormat,
        txDate.toISOString(),
        label,
      ].join(","),
    );
  }

  return lines.join("\n");
}

/**
 * 10,000+ International Banking Transaction Feed.
 * High-volume stress test dataset covering global institutional and commercial flows.
 */
export function generateInternationalBankingCsv(n: number = 10000): string {
  let s = 888123;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const corporates = [
    "CORP_APPLE_INC",
    "CORP_MICROSOFT_EU",
    "CORP_NESTLE_CH",
    "CORP_TOYOTA_FIN",
    "CORP_SIEMENS_AG",
  ];
  const accounts = Array.from({ length: 2500 }, (_, i) => `IBAN_US_${String(1000000 + i)}`);
  const mules = Array.from({ length: 30 }, (_, i) => `MULE_INTL_${String(i + 1).padStart(3, "0")}`);

  const lines = ["tx_id,from_account,to_account,amount,currency,payment_format,timestamp,label"];
  const baseDate = new Date(Date.UTC(2024, 1, 1, 0, 0, 0));

  for (let i = 0; i < n; i++) {
    const dice = r();
    let from = "";
    let to = "";
    let amount = 0;
    const currency = r() < 0.7 ? "USD" : r() < 0.9 ? "EUR" : "GBP";
    let paymentFormat = "Wire";
    let hour = 8 + Math.floor(r() * 12);
    let label = "Standard Personal";

    if (dice < 0.04) {
      // Structuring just below $10,000
      label = "Structuring & Smurfing";
      from = accounts[Math.floor(r() * 100)] ?? "";
      to = mules[Math.floor(r() * mules.length)] ?? "";
      amount = +(9250 + r() * 700).toFixed(2);
      paymentFormat = ["Wire", "Cash", "Crypto"][Math.floor(r() * 3)] ?? "";
      hour = 2;
    } else if (dice < 0.08) {
      // Mule pass-through
      label = "Mule Pass-Through";
      from = mules[Math.floor(r() * 15)] ?? "";
      to = mules[15 + Math.floor(r() * 15)] ?? "";
      amount = +(25000 + r() * 45000).toFixed(2);
      paymentFormat = "Wire";
      hour = 11;
    } else if (dice < 0.11) {
      // Circular Layering
      label = "Circular Layering";
      const idx = i % 5;
      from = mules[idx] ?? "";
      to = mules[(idx + 1) % 5] ?? "";
      amount = +(38000 + r() * 15000).toFixed(2);
      paymentFormat = ["Wire", "Crypto"][Math.floor(r() * 2)] ?? "";
      hour = 3;
    } else if (dice < 0.4) {
      // Corporate Commercial
      label = "Commercial & Merchant";
      from = accounts[Math.floor(r() * accounts.length)] ?? "";
      to = corporates[Math.floor(r() * corporates.length)] ?? "";
      amount = +(150 + Math.exp(4.5 + r() * 3.5)).toFixed(2);
      paymentFormat = ["Wire", "ACH", "Card"][Math.floor(r() * 3)] ?? "";
      hour = 9 + Math.floor(r() * 10);
    } else {
      // Standard Personal
      label = "Standard Personal";
      from = accounts[Math.floor(r() * accounts.length)] ?? "";
      to = accounts[Math.floor(r() * accounts.length)] ?? "";
      if (from === to) to = accounts[(accounts.indexOf(from) + 1) % accounts.length] ?? "";
      amount = +(15 + Math.exp(3.0 + r() * 2.8)).toFixed(2);
      paymentFormat = ["Card", "ACH", "Cheque"][Math.floor(r() * 3)] ?? "";
      hour = 8 + Math.floor(r() * 12);
    }

    const txDate = new Date(baseDate.getTime() + i * 18000 + hour * 3600000);
    lines.push(
      [
        `GLOBAL_${String(i + 1).padStart(7, "0")}`,
        from,
        to,
        amount.toFixed(2),
        currency,
        paymentFormat,
        txDate.toISOString(),
        label,
      ].join(","),
    );
  }

  return lines.join("\n");
}

/**
 * 100% Ordinary, benign consumer transactions.
 * Zero laundering patterns, realistic amounts, daytime hours, card/ACH payments.
 * Guaranteed 0% false positives.
 */
export function generateOrdinaryCsv(n: number = 1000): string {
  let s = 99991;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const customers = Array.from({ length: 800 }, (_, i) => `CUST_${String(i + 1).padStart(4, "0")}`);
  const merchants = [
    "GROCERY_SUPERSTORE",
    "AMAZON_RETAIL",
    "UTILITY_ELECTRIC",
    "COFFEE_SHOP",
    "GAS_STATION",
    "RESTAURANT_BISTRO",
    "PHARMACY_CARE",
    "STREAMING_SERVICE",
    "TELECOM_WIRELESS",
    "APARTMENT_RENT",
  ];

  const lines = ["tx_id,from_account,to_account,amount,currency,payment_format,timestamp,label"];
  const baseDate = new Date(Date.UTC(2024, 0, 15, 9, 0, 0));

  for (let i = 0; i < n; i++) {
    const from = customers[Math.floor(r() * customers.length)] ?? "";
    const to = merchants[Math.floor(r() * merchants.length)] ?? "";
    const amount = +(12.5 + r() * 180 + (r() < 0.1 ? r() * 600 : 0)).toFixed(2); // Typical $12 - $200
    const currency = r() < 0.9 ? "USD" : "EUR";
    const paymentFormat = ["Card", "Card", "ACH", "Cheque"][Math.floor(r() * 4)] ?? "Card";
    const hour = 8 + Math.floor(r() * 11); // 8 AM to 7 PM
    const txDate = new Date(baseDate.getTime() + i * 60000 + hour * 3600000);

    lines.push(
      [
        `ORD_${String(i + 1).padStart(5, "0")}`,
        from,
        to,
        amount.toFixed(2),
        currency,
        paymentFormat,
        txDate.toISOString(),
        "Standard Personal",
      ].join(","),
    );
  }

  return lines.join("\n");
}

/**
 * Known synthetic suspicious AML transactions.
 * Demonstrates structuring, rapid pass-through layering mules, and off-hours transfers.
 */
export function generateSuspiciousCsv(n: number = 500): string {
  let s = 77773;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const mules = ["MULE_ALPHA", "MULE_BETA", "MULE_GAMMA", "MULE_DELTA", "MULE_EPSILON"];
  const lines = ["tx_id,from_account,to_account,amount,currency,payment_format,timestamp,label"];
  const baseDate = new Date(Date.UTC(2024, 1, 1, 1, 30, 0));

  for (let i = 0; i < n; i++) {
    const from = mules[i % mules.length] ?? "";
    const to = mules[(i + 1) % mules.length] ?? "";
    // Structuring just below $10,000 threshold or high cash
    const amount = +(9200 + r() * 750).toFixed(2);
    const paymentFormat = r() < 0.6 ? "Wire" : r() < 0.85 ? "Crypto" : "Cash";
    const txDate = new Date(baseDate.getTime() + i * 180000); // 3 mins apart (rapid layering)

    const typ =
      i % 3 === 0
        ? "Structuring & Smurfing"
        : i % 3 === 1
          ? "Mule Pass-Through"
          : "Circular Layering";

    lines.push(
      [
        `SUSP_${String(i + 1).padStart(4, "0")}`,
        from,
        to,
        amount.toFixed(2),
        "USD",
        paymentFormat,
        txDate.toISOString(),
        typ,
      ].join(","),
    );
  }

  return lines.join("\n");
}

/**
 * Benchmark 100-account banking dataset: 50 risk accounts, 50 normal accounts.
 * Contains account-level profile features and 1 representative transaction per account.
 * Crucially: Contains representative transactions, NOT a closed cycle ledger (0 circular loops).
 */
export function generateSyntheticBankingAccounts100Csv(): string {
  let s = 54321;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const headers = [
    "account_id",
    "customer_type",
    "account_age_months",
    "avg_balance",
    "monthly_inflow",
    "monthly_outflow",
    "in_out_ratio",
    "txn_count_monthly",
    "cash_deposit_ratio",
    "international_tx_ratio",
    "night_activity_ratio",
    "representative_tx_amount",
    "representative_tx_channel",
    "from_account",
    "to_account",
    "representative_timestamp",
    "pattern_type_synthetic",
    "circular_flow_indicator_synthetic",
    "rapid_pass_through_indicator_synthetic",
    "data_origin",
    "risk_label_synthetic",
  ];

  const lines = [headers.join(",")];
  const baseDate = new Date(Date.UTC(2024, 2, 1, 10, 0, 0));

  const customerTypes = ["Individual", "SMB", "Corporate"];

  // 100 accounts total: 50 risk, 50 normal
  for (let i = 0; i < 100; i++) {
    const isRisk = i < 50;
    const accountId = `ACC_${String(i + 1).padStart(5, "0")}`;
    const custType = customerTypes[Math.floor(r() * (isRisk ? 2 : 3))] ?? "Individual";

    let ageMonths: number;
    let avgBalance: number;
    let monthlyInflow: number;
    let monthlyOutflow: number;
    let inOutRatio: number;
    let txnCount: number;
    let cashRatio: number;
    let intlRatio: number;
    let nightRatio: number;
    let repAmount: number;
    let repChannel: string;
    let patternType: string;
    let rapidPass: number;

    if (isRisk) {
      ageMonths = Math.floor(1 + r() * 18);
      avgBalance = Math.round(500 + r() * 12000);
      monthlyInflow = Math.round(45000 + r() * 250000);
      monthlyOutflow = Math.round(monthlyInflow * (0.94 + r() * 0.08));
      inOutRatio = +(monthlyOutflow / Math.max(monthlyInflow, 1)).toFixed(3);
      txnCount = Math.floor(45 + r() * 180);
      cashRatio = +(0.35 + r() * 0.5).toFixed(3);
      intlRatio = +(0.2 + r() * 0.6).toFixed(3);
      nightRatio = +(0.25 + r() * 0.55).toFixed(3);
      repAmount = Math.round(r() < 0.6 ? 9100 + r() * 850 : 25000 + r() * 45000);
      repChannel = ["Wire", "Cash", "Crypto", "UPI"][Math.floor(r() * 4)] ?? "Wire";
      patternType = ["structuring", "mule_conduit", "rapid_movement", "layering_attempt"][
        i % 4
      ]!;
      rapidPass = r() < 0.7 ? 1 : 0;
    } else {
      ageMonths = Math.floor(12 + r() * 120);
      avgBalance = Math.round(3500 + r() * 65000);
      monthlyInflow = Math.round(2500 + r() * 25000);
      monthlyOutflow = Math.round(monthlyInflow * (0.45 + r() * 0.45));
      inOutRatio = +(monthlyOutflow / Math.max(monthlyInflow, 1)).toFixed(3);
      txnCount = Math.floor(6 + r() * 35);
      cashRatio = +(0.02 + r() * 0.15).toFixed(3);
      intlRatio = +(r() * 0.08).toFixed(3);
      nightRatio = +(r() * 0.08).toFixed(3);
      repAmount = Math.round(35 + r() * 650);
      repChannel = ["Card", "ACH", "Cheque", "UPI"][Math.floor(r() * 4)] ?? "Card";
      patternType = "normal";
      rapidPass = 0;
    }

    const repFrom = accountId;
    const repTo = `EXT_COUNTERPARTY_${String(i + 1).padStart(3, "0")}`;
    const repTime = new Date(baseDate.getTime() + i * 3600000 * 4).toISOString();

    const row = [
      accountId,
      custType,
      ageMonths,
      avgBalance,
      monthlyInflow,
      monthlyOutflow,
      inOutRatio,
      txnCount,
      cashRatio,
      intlRatio,
      nightRatio,
      repAmount,
      repChannel,
      repFrom,
      repTo,
      repTime,
      patternType,
      0, // circular_flow_indicator_synthetic: NO loops
      rapidPass,
      "synthetic_banking_accounts_v1",
      isRisk ? "risk" : "normal",
    ];

    lines.push(row.join(","));
  }

  return lines.join("\n");
}
