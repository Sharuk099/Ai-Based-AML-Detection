/**
 * Documented benchmark transaction generators.
 * Provides realistic class distributions and behavioral signatures.
 */

export function syntheticCsv(n: number = 3000): string {
  let s = 12345;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const ordinaryAccounts = Array.from({ length: 1200 }, (_, i) => `ACC_${String(i + 1).padStart(5, "0")}`);
  const exchangeAccounts = ["BINANCE_HOT", "COINBASE_SETTLE", "KRAKEN_MAIN", "BITSTAMP_POOL"];
  const muleAccounts = Array.from({ length: 10 }, (_, i) => `MULE_${String(i + 1).padStart(3, "0")}`);

  const lines = ["tx_id,from_account,to_account,amount,currency,payment_format,timestamp,label"];

  const baseDate = new Date(Date.UTC(2024, 0, 1, 8, 0, 0));

  for (let i = 0; i < n; i++) {
    const dice = r();
    let from = "";
    let to = "";
    let amount = 0;
    let currency = r() < 0.85 ? "USD" : "EUR";
    let paymentFormat = "Card";
    let hour = 9 + Math.floor(r() * 10);
    let label = "Individual Wallet";

    if (dice < 0.07) {
      // 7% Money Laundering (Mule structuring, smurfing, or pass-through)
      label = "Money Laundering";
      from = muleAccounts[Math.floor(r() * muleAccounts.length)] ?? "";
      to = r() < 0.4 ? muleAccounts[Math.floor(r() * muleAccounts.length)] ?? "" : ordinaryAccounts[Math.floor(r() * 200)] ?? "";
      // Structuring just below $10,000 reporting threshold or rapid layering
      amount = r() < 0.65 ? 9000 + r() * 950 : 15000 + r() * 15000;
      paymentFormat = ["Wire", "Cash", "Crypto"][Math.floor(r() * 3)];
      hour = r() < 0.6 ? Math.floor(r() * 5) : 18 + Math.floor(r() * 6); // Unusual off-hours
    } else if (dice < 0.10) {
      // 3% Tumbler / Mixer
      label = "Tumbler";
      from = muleAccounts[Math.floor(r() * muleAccounts.length)] ?? "";
      to = ordinaryAccounts[Math.floor(r() * 100)] ?? "";
      amount = 500 + r() * 8000;
      paymentFormat = r() < 0.7 ? "Crypto" : "Wire";
      hour = Math.floor(r() * 24);
    } else if (dice < 0.25) {
      // 15% Centralized Exchange (Trading, institutional liquidity)
      label = "Centralized Exchange";
      const isDeposit = r() < 0.5;
      from = isDeposit ? ordinaryAccounts[Math.floor(r() * ordinaryAccounts.length)] ?? "" : exchangeAccounts[Math.floor(r() * exchangeAccounts.length)] ?? "";
      to = isDeposit ? exchangeAccounts[Math.floor(r() * exchangeAccounts.length)] ?? "" : ordinaryAccounts[Math.floor(r() * ordinaryAccounts.length)] ?? "";
      amount = 50 + Math.exp(3.5 + r() * 3.5);
      paymentFormat = ["Wire", "ACH", "Card"][Math.floor(r() * 3)];
      hour = 8 + Math.floor(r() * 14);
    } else {
      // 75% Individual Wallet (Everyday consumer & commercial activity)
      label = "Individual Wallet";
      from = ordinaryAccounts[Math.floor(r() * ordinaryAccounts.length)] ?? "";
      to = ordinaryAccounts[Math.floor(r() * ordinaryAccounts.length)] ?? "";
      if (from === to) to = ordinaryAccounts[(ordinaryAccounts.indexOf(from) + 1) % ordinaryAccounts.length] ?? "";
      amount = Math.max(8.5, Math.exp(2.5 + r() * 3.2)); // Normal amounts: ~$15 to ~$600
      paymentFormat = ["Card", "Card", "ACH", "Cheque"][Math.floor(r() * 4)];
      hour = 8 + Math.floor(r() * 12);
    }

    const txDate = new Date(baseDate.getTime() + i * 45000 + hour * 3600000);
    lines.push([
      `TX_${String(i + 1).padStart(6, "0")}`,
      from,
      to,
      amount.toFixed(2),
      currency,
      paymentFormat,
      txDate.toISOString(),
      label,
    ].join(","));
  }

  return lines.join("\n");
}

/**
 * 100% Ordinary, benign consumer transactions.
 * Zero laundering patterns, realistic amounts, daytime hours, card/ACH payments.
 */
export function generateOrdinaryCsv(n: number = 1000): string {
  let s = 99991;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const customers = Array.from({ length: 800 }, (_, i) => `CUST_${String(i + 1).padStart(4, "0")}`);
  const merchants = [
    "GROCERY_SUPERSTORE", "AMAZON_RETAIL", "UTILITY_ELECTRIC", "COFFEE_SHOP", "GAS_STATION",
    "RESTAURANT_BISTRO", "PHARMACY_CARE", "STREAMING_SERVICE", "TELECOM_WIRELESS", "APARTMENT_RENT",
  ];

  const lines = ["tx_id,from_account,to_account,amount,currency,payment_format,timestamp,label"];
  const baseDate = new Date(Date.UTC(2024, 0, 15, 9, 0, 0));

  for (let i = 0; i < n; i++) {
    const from = customers[Math.floor(r() * customers.length)];
    const to = merchants[Math.floor(r() * merchants.length)];
    const amount = +(12.5 + r() * 180 + (r() < 0.1 ? r() * 600 : 0)).toFixed(2); // Typical $12 - $200
    const currency = r() < 0.9 ? "USD" : "EUR";
    const paymentFormat = ["Card", "Card", "ACH", "Cheque"][Math.floor(r() * 4)];
    const hour = 8 + Math.floor(r() * 11); // 8 AM to 7 PM
    const txDate = new Date(baseDate.getTime() + i * 60000 + hour * 3600000);

    lines.push([
      `ORD_${String(i + 1).padStart(5, "0")}`,
      from,
      to,
      amount.toFixed(2),
      currency,
      paymentFormat,
      txDate.toISOString(),
      "Individual Wallet",
    ].join(","));
  }

  return lines.join("\n");
}

/**
 * Known synthetic suspicious AML transactions.
 * Demonstrates structuring ($9,200 - $9,900), rapid pass-through layering mules, and off-hours wires.
 */
export function generateSuspiciousCsv(n: number = 200): string {
  let s = 77773;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const mules = ["MULE_ALPHA", "MULE_BETA", "MULE_GAMMA", "MULE_DELTA", "MULE_EPSILON"];
  const lines = ["tx_id,from_account,to_account,amount,currency,payment_format,timestamp,label"];
  const baseDate = new Date(Date.UTC(2024, 1, 1, 1, 30, 0));

  for (let i = 0; i < n; i++) {
    const from = mules[i % mules.length];
    const to = mules[(i + 1) % mules.length];
    // Structuring just below $10,000 threshold
    const amount = +(9200 + r() * 750).toFixed(2);
    const paymentFormat = r() < 0.6 ? "Wire" : r() < 0.85 ? "Crypto" : "Cash";
    const txDate = new Date(baseDate.getTime() + i * 180000); // 3 mins apart (rapid layering)

    lines.push([
      `SUSP_${String(i + 1).padStart(4, "0")}`,
      from,
      to,
      amount.toFixed(2),
      "USD",
      paymentFormat,
      txDate.toISOString(),
      r() < 0.75 ? "Money Laundering" : "Tumbler",
    ].join(","));
  }

  return lines.join("\n");
}
