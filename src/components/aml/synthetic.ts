/** Synthetic demo data for trying the software. NOT real AML data and NOT evidence of detection performance. */
export function syntheticCsv(n: number) {
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const acc = Array.from({ length: 150 }, (_, i) => `ACC${String(i).padStart(4, "0")}`);
  const mules = acc.slice(0, 8);
  const lines = ["tx_id,from_account,to_account,amount,currency,payment_format,timestamp,label"];
  for (let i = 0; i < n; i++) {
    const ml = r() < 0.12;
    const from = ml ? mules[Math.floor(r() * mules.length)] : acc[8 + Math.floor(r() * 142)];
    const to = ml
      ? r() < 0.5
        ? mules[Math.floor(r() * mules.length)]
        : acc[Math.floor(r() * 150)]
      : acc[Math.floor(r() * 150)];
    const amount = ml ? (r() < 0.6 ? 9000 + r() * 990 : 200 + r() * 20000) : Math.exp(3 + r() * 6);
    const fmtp = ml
      ? ["Wire", "Cash", "ACH", "Crypto"][Math.floor(r() * (r() < 0.5 ? 2 : 4))]
      : ["Card", "ACH", "Wire", "Cheque"][Math.floor(r() * 4)];
    const hour = ml && r() < 0.5 ? Math.floor(r() * 5) : 8 + Math.floor(r() * 12);
    const ts = new Date(
      Date.UTC(2024, 0, 1 + Math.floor(i / 60), hour, Math.floor(r() * 60)),
    ).toISOString();
    const label = ml
      ? r() < 0.7
        ? "Money Laundering"
        : "Tumbler"
      : r() < 0.15
        ? "Centralized Exchange"
        : "Individual Wallet";
    lines.push(
      [`T${i}`, from, to, amount.toFixed(2), r() < 0.8 ? "USD" : "EUR", fmtp, ts, label].join(","),
    );
  }
  return lines.join("\n");
}
