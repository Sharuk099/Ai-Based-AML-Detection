import type { Row } from "./types";

export interface AccountAggregate {
  account_id: string;
  customer_type: "Individual" | "SMB" | "Corporate";
  account_age_months: number;
  avg_balance: number;
  monthly_inflow: number;
  monthly_outflow: number;
  in_out_ratio: number;
  txn_count_monthly: number;
  cash_deposit_ratio: number;
  international_tx_ratio: number;
  night_activity_ratio: number;
  representative_tx_amount?: number;
  representative_tx_channel?: string;
  from_account?: string;
  to_account?: string;
  representative_timestamp?: string;
}

/**
 * Detect whether dataset contains raw transaction rows rather than pre-aggregated account profiles.
 */
export function isRawTransactionDataset(columns: string[] | Row): boolean {
  const colSet = new Set(
    (Array.isArray(columns) ? columns : Object.keys(columns)).map((c) =>
      c.toLowerCase().trim(),
    ),
  );

  const hasTxMarkers =
    colSet.has("transaction_id") ||
    colSet.has("tx_id") ||
    colSet.has("from_account") ||
    colSet.has("to_account") ||
    colSet.has("sender") ||
    colSet.has("receiver");

  const hasAccountProfileMarkers =
    colSet.has("monthly_inflow") &&
    colSet.has("monthly_outflow") &&
    colSet.has("customer_type");

  return hasTxMarkers && !hasAccountProfileMarkers;
}

/**
 * Computes rolling account behavior aggregations grouped by counterparty entities.
 */
export function computeAccountAggregates(
  rows: Row[],
  roleMap: Record<string, string | undefined> = {},
): Map<string, AccountAggregate> {
  interface AccAccumulator {
    id: string;
    inflow: number;
    outflow: number;
    txCount: number;
    cashCount: number;
    intlCount: number;
    nightCount: number;
    cashVolume: number;
    totalVolume: number;
    isMerchant: boolean;
    customerType?: "Individual" | "SMB" | "Corporate";
    firstSeen: number;
    lastSeen: number;
    lastTx?: Row;
  }

  const accumulators = new Map<string, AccAccumulator>();

  const getOrCreate = (id: string): AccAccumulator => {
    let acc = accumulators.get(id);
    if (!acc) {
      acc = {
        id,
        inflow: 0,
        outflow: 0,
        txCount: 0,
        cashCount: 0,
        intlCount: 0,
        nightCount: 0,
        cashVolume: 0,
        totalVolume: 0,
        isMerchant:
          id.includes("RESTAURANT") ||
          id.includes("STORE") ||
          id.includes("MERCHANT") ||
          id.includes("CORP") ||
          id.includes("LTD"),
        firstSeen: Infinity,
        lastSeen: -Infinity,
      };
      accumulators.set(id, acc);
    }
    return acc;
  };

  const senderCol = roleMap["sender"] || "from_account";
  const receiverCol = roleMap["receiver"] || "to_account";
  const amountCol = roleMap["amount"] || "amount";
  const formatCol = roleMap["payment_format"] || "payment_format";
  const currencyCol = roleMap["currency"] || "currency";
  const timestampCol = roleMap["timestamp"] || "timestamp";

  for (const r of rows) {
    const rawAmt = parseFloat(String(r[amountCol] || "").replace(/,/g, "")) || 0;
    const fromId = String(r[senderCol] || r["from"] || "ACC_ANON_SRC").trim();
    const toId = String(r[receiverCol] || r["to"] || "ACC_ANON_DST").trim();
    const fmt = String(r[formatCol] || r["format"] || "").toLowerCase();
    const cur = String(r[currencyCol] || "USD").toUpperCase();

    const isCash =
      fmt.includes("cash") ||
      fmt.includes("atm") ||
      fmt === "cash deposit" ||
      fmt === "cash withdrawal";
    const isIntl =
      (cur !== "USD" && cur !== "INR" && cur !== "EUR") ||
      fmt.includes("swift") ||
      fmt.includes("wire_intl") ||
      fmt.includes("cross_border");

    let isNight = false;
    let tsMillis = NaN;
    const rawTs = r[timestampCol] || r["date"];
    if (rawTs) {
      const dt = new Date(rawTs);
      tsMillis = dt.getTime();
      if (!isNaN(tsMillis)) {
        const hr = dt.getUTCHours();
        if (hr >= 22 || hr < 6) isNight = true;
      }
    }

    if (fromId) {
      const s = getOrCreate(fromId);
      s.outflow += rawAmt;
      s.txCount += 1;
      s.totalVolume += rawAmt;
      if (isCash) {
        s.cashCount += 1;
        s.cashVolume += rawAmt;
      }
      if (isIntl) s.intlCount += 1;
      if (isNight) s.nightCount += 1;
      if (!isNaN(tsMillis)) {
        s.firstSeen = Math.min(s.firstSeen, tsMillis);
        s.lastSeen = Math.max(s.lastSeen, tsMillis);
      }
      s.lastTx = r;
      if (r["customer_type"]) {
        const ct = String(r["customer_type"]).trim();
        if (ct === "SMB" || ct === "Corporate" || ct === "Individual") {
          s.customerType = ct;
        }
      }
    }

    if (toId) {
      const d = getOrCreate(toId);
      d.inflow += rawAmt;
      d.txCount += 1;
      d.totalVolume += rawAmt;
      if (isCash) {
        d.cashCount += 1;
        d.cashVolume += rawAmt;
      }
      if (isIntl) d.intlCount += 1;
      if (isNight) d.nightCount += 1;
      if (!isNaN(tsMillis)) {
        d.firstSeen = Math.min(d.firstSeen, tsMillis);
        d.lastSeen = Math.max(d.lastSeen, tsMillis);
      }
      if (r["customer_type"]) {
        const ct = String(r["customer_type"]).trim();
        if (ct === "SMB" || ct === "Corporate" || ct === "Individual") {
          d.customerType = ct;
        }
      }
    }
  }

  const aggregates = new Map<string, AccountAggregate>();

  accumulators.forEach((acc, id) => {
    const totalTx = Math.max(1, acc.txCount);
    // Estimated balanced inflow/outflow when only one-sided flow observed
    const inflow =
      acc.inflow > 0 ? acc.inflow : Math.max(1200, acc.outflow * 1.08);
    const outflow =
      acc.outflow > 0 ? acc.outflow : Math.max(800, inflow * 0.75);

    const inOutRatio = +(inflow / (outflow + 1e-6)).toFixed(3);
    const cashRatio = +(acc.cashCount / totalTx).toFixed(3);
    const intlRatio = +(acc.intlCount / totalTx).toFixed(3);
    const nightRatio = +(acc.nightCount / totalTx).toFixed(3);

    // Estimate conservative account age & balance
    let ageMonths = 36;
    if (acc.firstSeen !== Infinity && acc.lastSeen !== -Infinity) {
      const spanDays = Math.max(1, (acc.lastSeen - acc.firstSeen) / (1000 * 3600 * 24));
      ageMonths = Math.min(120, Math.max(12, Math.round(spanDays / 30) + 12));
    }

    // Conservative average balance estimation without risk spikes
    const avgBalance = Math.round(Math.max(3500, inflow * 0.75));

    const customerType =
      acc.customerType ??
      (acc.isMerchant || acc.totalVolume > 200000
        ? "SMB"
        : "Individual");

    aggregates.set(id, {
      account_id: id,
      customer_type: customerType,
      account_age_months: ageMonths,
      avg_balance: avgBalance,
      monthly_inflow: Math.round(inflow),
      monthly_outflow: Math.round(outflow),
      in_out_ratio: inOutRatio,
      txn_count_monthly: totalTx,
      cash_deposit_ratio: cashRatio,
      international_tx_ratio: intlRatio,
      night_activity_ratio: nightRatio,
      representative_tx_amount: acc.lastTx ? (parseFloat(String(acc.lastTx[amountCol] || 0)) || 0) : 0,
      representative_tx_channel: acc.lastTx ? String(acc.lastTx[formatCol] || "Standard") : "Standard",
      from_account: acc.lastTx ? String(acc.lastTx[senderCol] || id) : id,
      to_account: acc.lastTx ? String(acc.lastTx[receiverCol] || "COUNTERPARTY") : "COUNTERPARTY",
      representative_timestamp: acc.lastTx ? String(acc.lastTx[timestampCol] || "") : "",
    });
  });

  return aggregates;
}

/**
 * Transforms a raw transaction dataset into an account-level entity dataset.
 */
export function aggregateTransactionsToAccounts(
  rows: Row[],
  roleMap: Record<string, string | undefined> = {},
): Row[] {
  const aggs = computeAccountAggregates(rows, roleMap);
  const outRows: Row[] = [];

  aggs.forEach((agg) => {
    outRows.push({
      account_id: agg.account_id,
      customer_type: agg.customer_type,
      account_age_months: String(agg.account_age_months),
      avg_balance: String(agg.avg_balance),
      monthly_inflow: String(agg.monthly_inflow),
      monthly_outflow: String(agg.monthly_outflow),
      in_out_ratio: String(agg.in_out_ratio),
      txn_count_monthly: String(agg.txn_count_monthly),
      cash_deposit_ratio: String(agg.cash_deposit_ratio),
      international_tx_ratio: String(agg.international_tx_ratio),
      night_activity_ratio: String(agg.night_activity_ratio),
      from_account: agg.from_account || agg.account_id,
      to_account: agg.to_account || "COUNTERPARTY",
      representative_tx_amount: String(agg.representative_tx_amount ?? 100),
      representative_tx_channel: agg.representative_tx_channel ?? "Card",
      representative_timestamp: agg.representative_timestamp ?? "",
    });
  });

  return outRows;
}

/**
 * Enriches transaction records with their counterparty account aggregations so
 * models expecting account behavioral features can score transaction logs.
 */
export function enrichTransactionsWithAggregates(
  rows: Row[],
  roleMap: Record<string, string | undefined> = {},
): Row[] {
  const aggs = computeAccountAggregates(rows, roleMap);
  const senderCol = roleMap["sender"] || "from_account";

  return rows.map((r) => {
    const fromId = String(r[senderCol] || r["from"] || "ACC_ANON_SRC").trim();
    const agg = aggs.get(fromId) || {
      account_id: fromId,
      customer_type: "Individual" as const,
      account_age_months: 36,
      avg_balance: 24000,
      monthly_inflow: 8500,
      monthly_outflow: 6500,
      in_out_ratio: 0.76,
      txn_count_monthly: 20,
      cash_deposit_ratio: 0.04,
      international_tx_ratio: 0.01,
      night_activity_ratio: 0.02,
    };

    return {
      ...r,
      customer_type: r["customer_type"] || agg.customer_type,
      account_age_months: r["account_age_months"] || String(agg.account_age_months),
      avg_balance: r["avg_balance"] || String(agg.avg_balance),
      monthly_inflow: r["monthly_inflow"] || String(agg.monthly_inflow),
      monthly_outflow: r["monthly_outflow"] || String(agg.monthly_outflow),
      in_out_ratio: r["in_out_ratio"] || String(agg.in_out_ratio),
      txn_count_monthly: r["txn_count_monthly"] || String(agg.txn_count_monthly),
      cash_deposit_ratio: r["cash_deposit_ratio"] || String(agg.cash_deposit_ratio),
      international_tx_ratio: r["international_tx_ratio"] || String(agg.international_tx_ratio),
      night_activity_ratio: r["night_activity_ratio"] || String(agg.night_activity_ratio),
    };
  });
}
