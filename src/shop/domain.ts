export const TERMS_VERSION = "2026-10-17-v1";
export type Row = Record<string, any>;
export const now = () => Math.floor(Date.now() / 1000);
export class ShopError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(code: string, status: number, message: string): never {
  throw new ShopError(code, status, message);
}
export function text(value: unknown, max: number, required = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)
  )
    fail("INVALID_FIELD", 400, "Un champ est manquant, trop long ou invalide.");
  const result = value.trim();
  if (required && !result)
    fail(
      "INVALID_FIELD",
      400,
      "Merci de remplir tous les champs obligatoires.",
    );
  return result;
}
export function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail("INVALID_NUMBER", 400, "Une quantité ou un montant est invalide.");
  return value;
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    fail("INVALID_ID", 400, "Référence invalide.");
  return value;
}
export const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const sha256 = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
export async function trackingToken(
  secret: string,
  orderId: string,
  version: number,
) {
  if (!secret || secret.length < 32)
    fail("CONFIG_TRACKING", 503, "La boutique est en cours de configuration.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`fce-order:${orderId}:${version}`),
    ),
  );
}
export function email(value: unknown) {
  const address = text(value, 254, true).toLowerCase();
  if (
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) ||
    /[\r\n]/.test(address)
  )
    fail("INVALID_EMAIL", 400, "Vérifiez votre adresse e-mail.");
  return address;
}
export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export function priceCart(
  lines: unknown,
  variants: Row[],
  options: Row[],
  products: Row[],
) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 40)
    fail("INVALID_CART", 400, "Le panier doit contenir entre 1 et 40 lignes.");
  const items = lines.map((line: Row) => {
    if (!line || typeof line !== "object")
      fail("INVALID_CART", 400, "Panier invalide.");
    const v = variants.find((v) => v.id === line.variant_id && v.active === 1);
    const p =
      v &&
      products.find(
        (p) => p.id === v.product_id && p.active === 1 && p.image_key,
      );
    if (!v || !p)
      fail(
        "UNAVAILABLE_ITEM",
        409,
        "Un article n’est plus disponible. Revenez au panier.",
      );
    const quantity = integer(line.quantity, 1, 30);
    if (!Array.isArray(line.options) || line.options.length > 10)
      fail("INVALID_OPTIONS", 400, "Options invalides.");
    const ids = new Set();
    const selected = line.options
      .map((selection: Row) => {
        const option = options.find(
          (o) =>
            o.id === selection?.id && o.product_id === p.id && o.active === 1,
        );
        if (!option || ids.has(option.id))
          fail(
            "INVALID_OPTIONS",
            400,
            "Une option n’est plus disponible ou est en double.",
          );
        ids.add(option.id);
        const value = option.requires_text
          ? text(selection.text, option.max_length, true)
          : "";
        return {
          id: option.id,
          label: option.label,
          text: value,
          price_cents: option.price_cents,
        };
      })
      .sort((a: Row, b: Row) => a.id.localeCompare(b.id));
    return {
      product_id: p.id,
      variant_id: v.id,
      name: p.name,
      sku: v.sku,
      supplier: v.supplier,
      size: v.size,
      color: v.color,
      options: selected,
      unit_cents:
        v.price_cents +
        selected.reduce((n: number, o: Row) => n + o.price_cents, 0),
      quantity,
    };
  });
  const total = items.reduce((n, i) => n + i.unit_cents * i.quantity, 0);
  if (!Number.isSafeInteger(total) || total > 1000000)
    fail(
      "INVALID_TOTAL",
      400,
      "Le montant du panier dépasse la limite de 10 000 €. Contactez le club.",
    );
  return { items, total };
}
// All provider data must be fetched through the authenticated API, never from the browser/webhook body.
export function paymentSummary(payments: Row[], total: number) {
  let authorized = 0,
    refunded = 0,
    contested = false,
    refunding = false,
    refused = false;
  const seen = new Set();
  for (const p of payments) {
    if (
      !Number.isSafeInteger(p.id) ||
      seen.has(p.id) ||
      !Number.isSafeInteger(p.amount) ||
      p.amount < 0
    )
      fail(
        "PAYMENT_MISMATCH",
        502,
        "Le paiement nécessite une vérification par le club.",
      );
    seen.add(p.id);
    const state = String(p.state).toLowerCase();
    const refunds = (p.refundOperations || []).filter(
      (r: Row) => String(r.status).toLowerCase() === "processed",
    );
    const amountRefunded = refunds.reduce(
      (n: number, r: Row) => n + integer(r.amount, 0, 10000000),
      0,
    );
    refunded += state === "refunded" ? p.amount : amountRefunded;
    if (["authorized", "refunded", "refunding", "contested"].includes(state))
      authorized += p.amount;
    contested ||= state === "contested";
    refunding ||=
      state === "refunding" ||
      (p.refundOperations || []).some((r: Row) =>
        ["init", "processing", "unknown"].includes(
          String(r.status).toLowerCase(),
        ),
      );
    refused ||= state === "refused";
  }
  const net = authorized - refunded;
  const status = contested
    ? "contested"
    : refunding
      ? "refunding"
      : authorized > total
        ? "review"
        : refunded > 0
          ? net <= 0
            ? "refunded"
            : "partially_refunded"
          : net === total
            ? "paid"
            : authorized > 0
              ? "review"
              : refused
                ? "refused"
                : "pending";
  return { status, authorized, refunded, net };
}
