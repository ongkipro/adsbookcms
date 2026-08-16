export type CrmOrderContext = {
  customerName?: string;
  customerPhone?: string;
  address?: string;
  district?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  orderNumber?: string;
  productName?: string;
  productPrice?: number;
  comparePrice?: number;
  shippingCost?: number;
  totalAmount?: number;
  courierCode?: string;
  cnoteNo?: string;
  sellerName?: string;
  bankAccounts?: string;
  epaymentLink?: string;
  orderDetailsLink?: string;
  paymentDetails?: string;
  paymentLink?: string;
  storeName?: string;
  trackingNumber?: string;
  detailUrl?: string;
};

export const defaultCrmTemplates: Record<string, string> = {
  welcome:
    'Hai {{name}}, terima kasih telah memesan {{product_name}} di toko kami! Berikut detail pesanan kamu:\n\n- Produk: {{product_name}}\n- Harga: {{product_price}}\n- Ongkir: {{shipping_cost}}\n- Jumlah: 1\n- Total: {{total_price}}\n- Dikirim ke:\n  Nama: {{name}}\n  No HP: {{phone}}\n  Alamat: {{address}}\n\nApakah bisa melengkapi alamatnya ya kak?',
  1:
    'Halo Kak {{name}}, terima kasih sebelumnya sudah tertarik dengan {{product_name}} dengan harga {{product_price}}. Aku mau pastikan, apakah ada kendala atau hal yang masih ingin Kakak pastikan sebelum lanjut pemesanan ya kak? Aku dengan senang hati bisa bantu jelaskan supaya Kakak bisa lebih yakin.',
  2:
    'Hai {{name}}, kami perhatikan pesanan kamu untuk {{product_name}} (Harga: {{product_price}}) belum diselesaikan. Berikut ringkasan pesanan kamu:\n\n- Produk: {{product_name}}\n- Harga: {{product_price}}\n- Total: {{total_price}}\n- Alamat: {{address}}, {{district}}, {{city}}\n\nSilakan lanjutkan pembayaran ke: {{bank_accounts}}\nAtau klik link berikut untuk pembayaran: {{epayment_link}}\n\nKalau ada yang bingung, tinggal tanya ya! {{seller_name}}',
  3:
    'Hai {{name}}, pesanan kamu untuk {{product_name}} (Harga: {{product_price}}) masih belum kami terima pembayarannya. Stok terbatas, jadi pastikan kamu menyelesaikan pembayaran segera agar pesananmu bisa kami proses.\n\nPembayaran bisa ke: {{bank_accounts}}\nAtau pakai link ini: {{epayment_link}}\n\nDitunggu ya! {{seller_name}}',
  4:
    'Hai {{name}}, kami ingin mengingatkan kembali bahwa pesanan kamu untuk {{product_name}} (Harga: {{product_price}}) masih belum diselesaikan. Kalau masih berminat, bisa langsung lanjut pembayaran di: {{epayment_link}}\nAtau transfer ke: {{bank_accounts}}\n\nKami siap bantu kalau ada kendala, {{seller_name}}',
  5:
    'Hai {{name}}, ini adalah pengingat terakhir untuk pesanan kamu atas {{product_name}} (Harga: {{product_price}}). Kalau masih ingin lanjut, bisa selesaikan pembayaran via: {{epayment_link}}\nAtau transfer ke: {{bank_accounts}}\n\nKalau belum bisa, tidak masalah. Terima kasih banyak sudah mampir! {{seller_name}}',
  6:
    'Hai {{name}}, kami belum menerima pembayaran untuk pesanan kamu atas {{product_name}} (Harga: {{product_price}}). Kalau kamu mebutuhkan bantuan atau ada pertanyaan, tinggal hubungi kami ya. Terima kasih sudah tertarik dengan produk kami! {{seller_name}}',
  7:
    'Hai {{name}}, pembayaran kamu untuk {{product_name}} sebesar {{total_price}} telah kami terima. Pesanan kamu sedang kami proses dan akan segera dikirim ke:\n{{address}}, {{district}}, {{city}}\n\nAkan kami update lagi kalau sudah dikirim ya, {{seller_name}}',
  8:
    'Hai {{name}}, pesanan kamu atas {{product_name}} sudah berhasil kami kirim!\n\nCek resinya di sini: {{receipt_number}}\nDetail pesanan: {{order_details_link}}\n\nSemoga kamu suka ya, sampai ketemu di pesanan selanjutnya, {{seller_name}}',
  9:
    'Halo {{name}}, kami lagi ada promo khusus untuk {{product_name}}, dari harga {{compare_price}} jadi cuma {{product_price}} saja! Stok terbatas ya, pesan sekarang sebelum kehabisan.',
  redirect:
    'Halo, saya sudah melakukan pemesanan {{product_name}}, atas nama {{name}}. Mohon segera diproses ya.',
};

export const CRM_TEMPLATE_KEYS = [
  'welcome',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'redirect',
] as const;

export function parseCrmTemplates(value: string | null) {
  if (!value) return { ...defaultCrmTemplates };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      CRM_TEMPLATE_KEYS.map((key) => [
        key,
        typeof parsed[key] === 'string'
          ? parsed[key].trim().slice(0, 1200) || defaultCrmTemplates[key]
          : defaultCrmTemplates[key],
      ]),
    );
  } catch {
    return { ...defaultCrmTemplates };
  }
}

const normalizeUtf8 = (value: string): string => value.normalize('NFC');

export function renderCrmMessage(template: string, ctx: CrmOrderContext): string {
  const fullAddress = [
    ctx.address,
    ctx.district ? `Kec. ${ctx.district}` : '',
    ctx.city,
    ctx.province,
    ctx.postalCode,
  ]
    .filter(Boolean)
    .join(', ');

  const fmtPrice = (val?: number) =>
    val != null && val > 0 ? `Rp ${Math.round(val).toLocaleString('id-ID')}` : 'Rp 0';

  const seller = ctx.sellerName || ctx.storeName || 'Toko Kami';

  const rawProductPrice =
    ctx.productPrice && ctx.productPrice > 0
      ? ctx.productPrice
      : (ctx.totalAmount != null && ctx.totalAmount > 0
          ? Math.max(0, ctx.totalAmount - (ctx.shippingCost || 0))
          : 0);
  const productPriceStr = fmtPrice(rawProductPrice);

  const rawTotalAmount =
    ctx.totalAmount && ctx.totalAmount > 0
      ? ctx.totalAmount
      : (rawProductPrice > 0 ? rawProductPrice + (ctx.shippingCost || 0) : 0);
  const totalStr = fmtPrice(rawTotalAmount);

  const shippingStr = fmtPrice(ctx.shippingCost ?? 0);
  const comparePriceStr = ctx.comparePrice && ctx.comparePrice > 0
    ? fmtPrice(ctx.comparePrice)
    : (rawProductPrice > 0 ? fmtPrice(Math.round(rawProductPrice * 1.3)) : 'Rp 180.000');

  const replacements: Record<string, string> = {
    name: ctx.customerName || 'Pelanggan',
    nama: ctx.customerName || 'Pelanggan',
    customer_name: ctx.customerName || 'Pelanggan',
    customername: ctx.customerName || 'Pelanggan',

    product_name: ctx.productName || 'Produk',
    productname: ctx.productName || 'Produk',
    produk: ctx.productName || 'Produk',
    nama_produk: ctx.productName || 'Produk',
    item_name: ctx.productName || 'Produk',

    product_price: productPriceStr,
    productprice: productPriceStr,
    harga_produk: productPriceStr,
    hargaproduk: productPriceStr,
    harga: productPriceStr,
    price: productPriceStr,

    compare_price: comparePriceStr,
    compareprice: comparePriceStr,
    harga_coret: comparePriceStr,
    harga_lama: comparePriceStr,

    shipping_cost: shippingStr,
    shippingcost: shippingStr,
    ongkir: shippingStr,
    biaya_ongkir: shippingStr,
    shipping_cost_cod_cost: totalStr,

    total_price: totalStr,
    totalprice: totalStr,
    total_amount: totalStr,
    totalamount: totalStr,
    total: totalStr,
    total_bayar: totalStr,
    total_tagihan: totalStr,

    phone: ctx.customerPhone || '',
    customer_phone: ctx.customerPhone || '',
    hp: ctx.customerPhone || '',
    wa: ctx.customerPhone || '',
    no_hp: ctx.customerPhone || '',

    address: ctx.address || fullAddress || '',
    alamat: ctx.address || fullAddress || '',
    alamat_lengkap: fullAddress || ctx.address || '',

    district: ctx.district || '',
    kecamatan: ctx.district || '',
    city: ctx.city || '',
    kota: ctx.city || '',
    province: ctx.province || '',
    provinsi: ctx.province || '',
    postal_code: ctx.postalCode || '',
    kode_pos: ctx.postalCode || '',

    seller_name: seller,
    sellername: seller,
    toko: seller,
    nama_toko: seller,
    store_name: seller,

    bank_accounts:
      ctx.bankAccounts ||
      ctx.paymentDetails ||
      'Detail pembayaran / rekening bank',
    bank_account:
      ctx.bankAccounts ||
      ctx.paymentDetails ||
      'Detail pembayaran / rekening bank',
    rekening:
      ctx.bankAccounts ||
      ctx.paymentDetails ||
      'Detail pembayaran / rekening bank',

    epayment_link:
      ctx.epaymentLink || ctx.paymentLink || 'Link pembayaran belum tersedia',
    payment_link:
      ctx.epaymentLink || ctx.paymentLink || 'Link pembayaran belum tersedia',
    link_pembayaran:
      ctx.epaymentLink || ctx.paymentLink || 'Link pembayaran belum tersedia',

    order_details_link:
      ctx.orderDetailsLink || ctx.detailUrl || 'Link detail belum tersedia',
    link_detail:
      ctx.orderDetailsLink || ctx.detailUrl || 'Link detail belum tersedia',

    receipt_number: ctx.cnoteNo || ctx.trackingNumber || '-',
    resi: ctx.cnoteNo || ctx.trackingNumber || '-',
    no_resi: ctx.cnoteNo || ctx.trackingNumber || '-',

    courier: ctx.courierCode || '-',
    kurir: ctx.courierCode || '-',

    inv: ctx.orderNumber || '',
    invoice: ctx.orderNumber || '',
    order_number: ctx.orderNumber || '',
    no_invoice: ctx.orderNumber || '',
    no_order: ctx.orderNumber || '',
  };

  const normalizedReplacements = Object.fromEntries(
    Object.entries(replacements).map(([key, value]) => [
      key,
      normalizeUtf8(value),
    ]),
  );

  return normalizeUtf8(template)
    .replace(/{{\s*([^{}\s]+)\s*}}/g, (token, rawKey: string) => {
      const key = rawKey
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[.-]/g, '_')
        .toLowerCase()
        .trim();
      return normalizedReplacements[key] ?? token;
    })
    .normalize('NFC');
}

export function buildWaUrl(phone: string, text: string): string {
  const cleanPhone = (phone || '')
    .replace(/\D/g, '')
    .replace(/^0/, '62');
  const cleanText = text
    .normalize('NFC')
    .replace(/[\uFE0E\uFE0F](?![\uFE0E\uFE0F])/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(cleanText)}`;
}
